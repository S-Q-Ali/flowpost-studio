import { supabase } from "@/integrations/supabase/client";
import { getDefaultMasterPrompt, type MasterPrompt } from "@/lib/prompt-templates";


export type StepId =
  | "fetching-key"
  | "downloading"
  | "transcribing"
  | "analyzing-visuals"
  | "generating-captions"
  | "done"
  | "error";

export interface StepProgress {
  step: StepId;
  label: string;
  progress: number;
}

export type OnProgress = (progress: StepProgress) => void;

const STEP_LABELS: Record<StepId, string> = {
  "fetching-key": "Preparing...",
  downloading: "Downloading file...",
  transcribing: "Transcribing audio...",
  "analyzing-visuals": "Analyzing content...",
  "generating-captions": "Creating captions...",
  done: "Done!",
  error: "Error",
};

function emit(onProgress: OnProgress | undefined, step: StepId, progress: number) {
  onProgress?.({ step, label: STEP_LABELS[step], progress });
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
}

async function groqApiCall(
  mode: string,
  payload: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<any> {
  throwIfAborted(signal);
  const token = localStorage.getItem("flowpost_token");
  const { data, error } = await supabase.functions.invoke("generate-ai-captions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ mode, ...payload }),
    signal,
  });

  if (error || data?.error) {
    throw new Error(data?.error || error?.message || "Groq proxy failed");
  }
  return data;
}

async function getFileToken(itemId: string, signal?: AbortSignal): Promise<{ driveToken: string; driveUrl: string }> {
  throwIfAborted(signal);
  const token = localStorage.getItem("flowpost_token");
  const { data, error } = await supabase.functions.invoke("generate-ai-captions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ mode: "get-file-token", workflow_item_id: itemId }),
    signal,
  });

  if (error || data?.error) {
    throw new Error(data?.error || error?.message || "Failed to get file token");
  }

  return { driveToken: data.driveToken, driveUrl: data.driveUrl };
}

async function downloadVideo(
  driveToken: string,
  driveUrl: string,
  onProgress?: OnProgress,
  signal?: AbortSignal,
): Promise<Blob> {
  throwIfAborted(signal);
  const res = await fetch(driveUrl, {
    headers: { Authorization: `Bearer ${driveToken}` },
    signal,
  });
  if (!res.ok) {
    throw new Error(`Failed to download video: ${res.status}`);
  }

  const contentLength = res.headers.get("Content-Length");
  const total = contentLength ? parseInt(contentLength, 10) : 0;
  const reader = res.body!.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    throwIfAborted(signal);
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total) {
      emit(onProgress, "downloading", Math.round((received / total) * 100));
    }
  }

  return new Blob(chunks);
}

async function extractFrames(videoBlob: Blob, signal?: AbortSignal): Promise<string[]> {
  const url = URL.createObjectURL(videoBlob);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  await video.play();
  video.pause();

  const duration = video.duration || 30;
  const timestamps = [
    Math.min(2, duration / 2),
    duration / 2,
    Math.max(duration - 2, duration / 2),
  ];

  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext("2d")!;

  const frames: string[] = [];
  for (const t of timestamps) {
    throwIfAborted(signal);
    video.currentTime = t;
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
    });
    throwIfAborted(signal);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    frames.push(canvas.toDataURL("image/jpeg", 0.6));
  }

  URL.revokeObjectURL(url);
  video.remove();
  return frames;
}

async function extractAudio(videoBlob: Blob, onProgress?: OnProgress, signal?: AbortSignal): Promise<Blob> {
  const url = URL.createObjectURL(videoBlob);
  const video = document.createElement("video");
  video.muted = false;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;

  await video.play();
  video.pause();

  const audioCtx = new AudioContext();
  if (audioCtx.state === "suspended") await audioCtx.resume();

  const source = audioCtx.createMediaElementSource(video);
  const dest = audioCtx.createMediaStreamDestination();
  source.connect(dest);

  const mimeType = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ].find((t) => MediaRecorder.isTypeSupported(t)) || "";

  const recorder = new MediaRecorder(dest.stream, mimeType ? { mimeType } : {});
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  const done = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });
  recorder.start(2000);

  video.ontimeupdate = () => {
    const pct = Math.round((video.currentTime / video.duration) * 100);
    emit(onProgress, "transcribing", Math.min(pct, 90));
  };
  video.play();

  await new Promise<void>((resolve) => { video.onended = () => resolve(); });
  throwIfAborted(signal);
  await new Promise((r) => setTimeout(r, 500));
  recorder.stop();
  await done;
  throwIfAborted(signal);

  audioCtx.close();
  URL.revokeObjectURL(url);
  video.remove();

  const ext = recorder.mimeType.includes("mp4") ? "m4a" : "webm";
  return new Blob(chunks, { type: `audio/${ext}` });
}

async function groqWhisper(
  audioBlob: Blob,
  _apiKey: string,
  onProgress?: OnProgress,
  signal?: AbortSignal,
): Promise<string> {
  emit(onProgress, "transcribing", 95);

  const ext = audioBlob.type.includes("mp4") ? "m4a" : "webm";
  const buffer = await audioBlob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const audioBase64 = btoa(binary);

  const data = await groqApiCall(
    "groq-transcribe",
    {
      audio_base64: audioBase64,
      filename: `audio.${ext}`,
    },
    signal,
  );

  emit(onProgress, "transcribing", 100);
  return data.transcript;
}

async function groqDescribeFrames(
  frames: string[],
  _apiKey: string,
  onProgress?: OnProgress,
  signal?: AbortSignal,
): Promise<string> {
  emit(onProgress, "analyzing-visuals", 0);

  const content: { type: "text" | "image_url"; text?: string; image_url?: { url: string } }[] = [
    { type: "text", text: "Analyze these video frames in detail. Identify any celebrities, athletes, streamers, or well-known personalities visible. Be specific — use full names (e.g. 'Cristiano Ronaldo', 'iShowSpeed'). Describe: setting, people/objects, actions, mood, text overlays, and overall vibe. This will be used alongside an audio transcript to generate social media captions." },
  ];
  for (const frame of frames) {
    content.push({ type: "image_url", image_url: { url: frame } });
  }

  const data = await groqApiCall(
    "groq-chat",
    {
      model: "qwen/qwen3.6-27b",
      messages: [{ role: "user", content }],
      temperature: 0.6,
      max_tokens: 512,
    },
    signal,
  );

  const description: string = data.choices?.[0]?.message?.content || "";
  emit(onProgress, "analyzing-visuals", 100);
  return description;
}

export async function groqGenerateCaptions(
  transcript: string,
  visualDescription: string,
  fileName: string,
  masterPrompt: MasterPrompt,
  _apiKey: string,
  platforms?: string[],
  onProgress?: OnProgress,
  signal?: AbortSignal,
): Promise<Record<string, string>> {
  emit(onProgress, "generating-captions", 0);

  const platformHint = platforms?.length
    ? `\n\nIMPORTANT: Only generate captions for these platforms: ${platforms.join(", ")}.`
    : "";

  const promptJson = masterPrompt.raw_prompt
    ? JSON.stringify(JSON.parse(masterPrompt.raw_prompt), null, 2)
    : JSON.stringify(masterPrompt, null, 2);

  const systemPrompt = `You are an expert social media content strategist. Generate captions for a video file named "${fileName}".

Follow this prompt template EXACTLY — return valid JSON matching the output_format below.

${promptJson}
${platformHint}

Return ONLY valid JSON — no markdown, no code fences, no explanation.`;

  const userMessage = `Audio transcript:\n\n${transcript || "No transcript available."}\n\nVisual description:\n\n${visualDescription || "No visual description available."}`;

  const chatData = await groqApiCall(
    "groq-chat",
    {
      model: "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 4096,
    },
    signal,
  );

  const content: string = chatData.choices?.[0]?.message?.content || "";

  let cleaned = content.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  }

  let captions: Record<string, string>;
  try {
    captions = JSON.parse(cleaned);
  } catch {
    captions = {};
  }

  emit(onProgress, "generating-captions", 100);
  return captions;
}

export interface GenerateCaptionsOptions {
  item: {
    id: string;
    file_name: string;
    mime_type: string | null;
  };
  masterPrompt?: MasterPrompt | null;
  platforms?: string[];
  onProgress?: OnProgress;
  skipAudio?: boolean;
  signal?: AbortSignal;
}

const PLATFORM_ALLOWED_KEYS: Record<string, string[]> = {
  youtube: ["yt_video_title", "yt_video_description"],
  facebook: ["fb_ig_caption", "caption"],
  instagram: ["fb_ig_caption", "caption"],
  tiktok: ["tiktok_caption"],
  linkedin: ["linkedin_caption"],
};

export interface AICaptionResult {
  captions: Record<string, string>;
  transcript: string;
  visualDescription: string;
}

export async function generateAICaptions(options: GenerateCaptionsOptions): Promise<AICaptionResult> {
  const { item, masterPrompt, platforms, onProgress, signal } = options;
  const prompt = masterPrompt || getDefaultMasterPrompt();

  try {
    emit(onProgress, "downloading", 0);
    let videoBlob: Blob;
    try {
      const { driveToken, driveUrl } = await getFileToken(item.id, signal);
      videoBlob = await downloadVideo(driveToken, driveUrl, onProgress, signal);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      console.error("[captions] FAIL download", err);
      throw new Error(`download: ${err instanceof Error ? err.message : String(err)}`);
    }
    emit(onProgress, "downloading", 100);

    let transcript: string;
    if (options.skipAudio) {
      transcript = "";
      emit(onProgress, "transcribing", 100);
    } else {
      let audioBlob: Blob;
      try {
        audioBlob = await extractAudio(videoBlob, onProgress, signal);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") throw err;
        console.error("[captions] FAIL extractAudio", err);
        throw new Error(`audio: ${err instanceof Error ? err.message : String(err)}`);
      }

      try {
        transcript = await groqWhisper(audioBlob, "", onProgress, signal);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") throw err;
        console.error("[captions] FAIL groqWhisper", err);
        throw new Error(`whisper: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        audioBlob = null!;
      }
    }

    let visualDescription: string;
    try {
      const frames = await extractFrames(videoBlob, signal);
      if (frames.length > 0) {
        visualDescription = await groqDescribeFrames(frames, "", onProgress, signal);
      } else {
        visualDescription = "";
        emit(onProgress, "analyzing-visuals", 100);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      console.error("[captions] FAIL extractFrames/describe", err);
      visualDescription = "";
      emit(onProgress, "analyzing-visuals", 100);
    }

    videoBlob=null!;

    let captions: Record<string, string>;
    try {
      captions = await groqGenerateCaptions(transcript, visualDescription, item.file_name, prompt, "", platforms, onProgress, signal);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      console.error("[captions] FAIL groqGenerateCaptions", err);
      throw new Error(`generate: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Strip keys not relevant to selected platforms
    if (platforms?.length) {
      const allowed = new Set(platforms.flatMap((p) => PLATFORM_ALLOWED_KEYS[p] || []));
      for (const key of Object.keys(captions)) {
        if (!allowed.has(key)) delete captions[key];
      }
    }

    emit(onProgress, "done", 100);
    return { captions, transcript, visualDescription };
  } catch (err) {
    emit(onProgress, "error", 0);
    throw err;
  }
}

export async function regenerateCaptions(
  transcript: string,
  visualDescription: string,
  fileName: string,
  masterPrompt?: MasterPrompt | null,
  platforms?: string[],
  onProgress?: OnProgress,
  signal?: AbortSignal,
): Promise<Record<string, string>> {
  const prompt = masterPrompt || getDefaultMasterPrompt();
  const captions = await groqGenerateCaptions(transcript, visualDescription, fileName, prompt, "", platforms, onProgress, signal);

  if (platforms?.length) {
    const allowed = new Set(platforms.flatMap((p) => PLATFORM_ALLOWED_KEYS[p] || []));
    for (const key of Object.keys(captions)) {
      if (!allowed.has(key)) delete captions[key];
    }
  }

  return captions;
}
