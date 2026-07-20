import { supabase } from "@/integrations/supabase/client";
import { getDefaultMasterPrompt, type MasterPrompt } from "@/lib/prompt-templates";

const GROQ_API_BASE = "https://api.groq.com/openai/v1";

let groqApiKey: string | null = null;

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
  "fetching-key": "Authenticating...",
  downloading: "Downloading video from Drive...",
  transcribing: "Extracting audio & transcribing...",
  "analyzing-visuals": "Analyzing video frames...",
  "generating-captions": "Generating platform captions...",
  done: "Done!",
  error: "Error",
};

function emit(onProgress: OnProgress | undefined, step: StepId, progress: number) {
  onProgress?.({ step, label: STEP_LABELS[step], progress });
}

async function getGroqKey(): Promise<string> {
  if (groqApiKey) return groqApiKey;

  const token = localStorage.getItem("flowpost_token");
  const { data, error } = await supabase.functions.invoke("generate-ai-captions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ mode: "get-key" }),
  });

  if (error || data?.error) {
    throw new Error(data?.error || error?.message || "Failed to fetch API key");
  }

  groqApiKey = data.key;
  return groqApiKey;
}

async function getFileToken(itemId: string): Promise<{ driveToken: string; driveUrl: string }> {
  const token = localStorage.getItem("flowpost_token");
  const { data, error } = await supabase.functions.invoke("generate-ai-captions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ mode: "get-file-token", workflow_item_id: itemId }),
  });

  if (error || data?.error) {
    throw new Error(data?.error || error?.message || "Failed to get file token");
  }

  return { driveToken: data.driveToken, driveUrl: data.driveUrl };
}

async function downloadVideo(driveToken: string, driveUrl: string, onProgress?: OnProgress): Promise<Blob> {
  const res = await fetch(driveUrl, {
    headers: { Authorization: `Bearer ${driveToken}` },
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

async function extractFrames(videoBlob: Blob): Promise<string[]> {
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
    video.currentTime = t;
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
    });
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    frames.push(canvas.toDataURL("image/jpeg", 0.6));
  }

  URL.revokeObjectURL(url);
  video.remove();
  return frames;
}

async function extractAudio(videoBlob: Blob, onProgress?: OnProgress): Promise<Blob> {
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
  await new Promise((r) => setTimeout(r, 500));
  recorder.stop();
  await done;

  audioCtx.close();
  URL.revokeObjectURL(url);
  video.remove();

  const ext = recorder.mimeType.includes("mp4") ? "m4a" : "webm";
  return new Blob(chunks, { type: `audio/${ext}` });
}

async function groqWhisper(audioBlob: Blob, apiKey: string, onProgress?: OnProgress): Promise<string> {
  emit(onProgress, "transcribing", 95);

  const ext = audioBlob.type.includes("mp4") ? "m4a" : "webm";
  const formData = new FormData();
  formData.append("file", audioBlob, `audio.${ext}`);
  formData.append("model", "whisper-large-v3-turbo");
  formData.append("response_format", "text");

  const res = await fetch(`${GROQ_API_BASE}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Whisper error (${res.status}): ${errText}`);
  }

  const transcript = await res.text();
  emit(onProgress, "transcribing", 100);
  return transcript;
}

async function groqDescribeFrames(
  frames: string[],
  apiKey: string,
  onProgress?: OnProgress,
): Promise<string> {
  emit(onProgress, "analyzing-visuals", 0);

  const content: { type: "text" | "image_url"; text?: string; image_url?: { url: string } }[] = [
    { type: "text", text: "Analyze these video frames in detail. Identify any celebrities, athletes, streamers, or well-known personalities visible. Be specific — use full names (e.g. 'Cristiano Ronaldo', 'iShowSpeed'). Describe: setting, people/objects, actions, mood, text overlays, and overall vibe. This will be used alongside an audio transcript to generate social media captions." },
  ];
  for (const frame of frames) {
    content.push({ type: "image_url", image_url: { url: frame } });
  }

  const res = await fetch(`${GROQ_API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "qwen/qwen3.6-27b",
      messages: [{ role: "user", content }],
      temperature: 0.6,
      max_tokens: 512,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Vision error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const description: string = data.choices?.[0]?.message?.content || "";
  emit(onProgress, "analyzing-visuals", 100);
  return description;
}

async function groqGenerateCaptions(
  transcript: string,
  visualDescription: string,
  fileName: string,
  masterPrompt: MasterPrompt,
  apiKey: string,
  platforms?: string[],
  onProgress?: OnProgress,
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

  const res = await fetch(`${GROQ_API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 2048,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Llama error (${res.status}): ${errText}`);
  }

  const chatData = await res.json();
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
}

const PLATFORM_ALLOWED_KEYS: Record<string, string[]> = {
  youtube: ["yt_video_title", "yt_video_description"],
  facebook: ["fb_ig_caption", "caption"],
  instagram: ["fb_ig_caption", "caption"],
  tiktok: ["tiktok_caption"],
  linkedin: ["linkedin_caption"],
};

export async function generateAICaptions(options: GenerateCaptionsOptions): Promise<Record<string, string>> {
  const { item, masterPrompt, platforms, onProgress } = options;
  const prompt = masterPrompt || getDefaultMasterPrompt();

  try {
    emit(onProgress, "fetching-key", 0);
    let apiKey: string;
    try {
      apiKey = await getGroqKey();
    } catch (err) {
      console.error("[captions] FAIL getGroqKey", err);
      throw new Error(`getKey: ${err instanceof Error ? err.message : String(err)}`);
    }
    emit(onProgress, "fetching-key", 100);

    emit(onProgress, "downloading", 0);
    let videoBlob: Blob;
    try {
      const { driveToken, driveUrl } = await getFileToken(item.id);
      videoBlob = await downloadVideo(driveToken, driveUrl, onProgress);
    } catch (err) {
      console.error("[captions] FAIL download", err);
      throw new Error(`download: ${err instanceof Error ? err.message : String(err)}`);
    }
    emit(onProgress, "downloading", 100);

    let audioBlob: Blob;
    try {
      audioBlob = await extractAudio(videoBlob, onProgress);
    } catch (err) {
      console.error("[captions] FAIL extractAudio", err);
      throw new Error(`audio: ${err instanceof Error ? err.message : String(err)}`);
    }

    let transcript: string;
    try {
      transcript = await groqWhisper(audioBlob, apiKey, onProgress);
    } catch (err) {
      console.error("[captions] FAIL groqWhisper", err);
      throw new Error(`whisper: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      audioBlob = null!;
    }

    let visualDescription: string;
    try {
      const frames = await extractFrames(videoBlob);
      if (frames.length > 0) {
        visualDescription = await groqDescribeFrames(frames, apiKey, onProgress);
      } else {
        visualDescription = "";
        emit(onProgress, "analyzing-visuals", 100);
      }
    } catch (err) {
      console.error("[captions] FAIL extractFrames/describe", err);
      visualDescription = "";
      emit(onProgress, "analyzing-visuals", 100);
    }

    videoBlob=null!;

    let captions: Record<string, string>;
    try {
      captions = await groqGenerateCaptions(transcript, visualDescription, item.file_name, prompt, apiKey, platforms, onProgress);
    } catch (err) {
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
    return captions;
  } catch (err) {
    emit(onProgress, "error", 0);
    throw err;
  }
}
