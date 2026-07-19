import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { supabase } from "@/integrations/supabase/client";
import { getDefaultMasterPrompt, type MasterPrompt } from "@/lib/prompt-templates";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

const GROQ_API_BASE = "https://api.groq.com/openai/v1";

let groqApiKey: string | null = null;
let ffmpeg: FFmpeg | null = null;
let ffmpegLoaded = false;

export type StepId =
  | "fetching-key"
  | "downloading"
  | "loading-ffmpeg"
  | "extracting"
  | "transcribing"
  | "analyzing-visuals"
  | "generating-captions"
  | "saving"
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
  "loading-ffmpeg": "Loading FFmpeg engine...",
  extracting: "Extracting audio & frames...",
  transcribing: "Transcribing audio with Whisper...",
  "analyzing-visuals": "Analyzing video frames...",
  "generating-captions": "Generating platform captions...",
  saving: "Saving captions...",
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

async function getFileToken(itemId: string): Promise<string> {
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

  return data.token;
}

async function downloadVideo(encryptedToken: string): Promise<Blob> {
  const funcUrl = `${SUPABASE_URL}/functions/v1/get-file?token=${encodeURIComponent(encryptedToken)}`;
  const res = await fetch(funcUrl);
  if (!res.ok) {
    throw new Error(`Failed to download video: ${res.status}`);
  }
  return await res.blob();
}

async function loadFFmpeg(onProgress?: OnProgress): Promise<FFmpeg> {
  if (ffmpegLoaded && ffmpeg) return ffmpeg;

  emit(onProgress, "loading-ffmpeg", 0);

  ffmpeg = new FFmpeg();

  const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
  });

  ffmpegLoaded = true;
  emit(onProgress, "loading-ffmpeg", 100);
  return ffmpeg;
}

async function extractAudioAndFrames(
  ffmpegInstance: FFmpeg,
  videoBlob: Blob,
  fileName: string,
  onProgress?: OnProgress,
): Promise<{ audioBlob: Blob; frames: string[] }> {
  emit(onProgress, "extracting", 0);

  const inputName = fileName || "input.mp4";
  await ffmpegInstance.writeFile(inputName, await fetchFile(videoBlob));
  emit(onProgress, "extracting", 20);

  const audioName = "output.mp3";
  await ffmpegInstance.exec(["-i", inputName, "-vn", "-acodec", "libmp3lame", "-b:a", "128k", audioName]);
  emit(onProgress, "extracting", 60);

  const audioData = await ffmpegInstance.readFile(audioName);
  const audioBlob = new Blob([audioData], { type: "audio/mpeg" });

  const durationSec = 30;
  const frameTimestamps = [2, durationSec / 2, durationSec - 2];
  const frames: string[] = [];

  for (let i = 0; i < frameTimestamps.length; i++) {
    const frameName = `frame_${i}.jpg`;
    await ffmpegInstance.exec([
      "-i", inputName,
      "-ss", String(frameTimestamps[i]),
      "-vframes", "1",
      "-q:v", "2",
      frameName,
    ]);
    const frameData = await ffmpegInstance.readFile(frameName);
    const uint8 = new Uint8Array(frameData as ArrayBuffer);
    let binary = "";
    for (let j = 0; j < uint8.byteLength; j++) {
      binary += String.fromCharCode(uint8[j]);
    }
    frames.push(`data:image/jpeg;base64,${btoa(binary)}`);
  }

  await ffmpegInstance.exec(["-i", inputName, "-ss", "00:00:02", "-vframes", "1", "frame_0.jpg"]);

  emit(onProgress, "extracting", 100);
  return { audioBlob, frames };
}

async function groqWhisper(audioBlob: Blob, apiKey: string, onProgress?: OnProgress): Promise<string> {
  emit(onProgress, "transcribing", 0);

  const formData = new FormData();
  formData.append("file", audioBlob, "audio.mp3");
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
    { type: "text", text: "Describe what's happening in these video frames in detail. Include: setting, people/objects, actions, mood, text overlays, and overall vibe. This will be used alongside an audio transcript to generate social media captions." },
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
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
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
  onProgress?: OnProgress,
): Promise<Record<string, string>> {
  emit(onProgress, "generating-captions", 0);

  const systemPrompt = `You are an expert social media content strategist. Generate platform-optimized captions for a video file named "${fileName}".

## STRICT RULES
${masterPrompt.strict_rules}

## OUTPUT FORMAT
${masterPrompt.output_format}

## EXAMPLE OUTPUT
${masterPrompt.example_output}

## DEFAULT HASHTAGS
${masterPrompt.hashtags}

## GENERATION INSTRUCTION
${masterPrompt.generation_instruction}

Return ONLY valid JSON — no markdown, no code fences, no explanation.`;

  const userMessage = `Audio transcript:\n\n${transcript || "No transcript available."}\n\nVisual description:\n\n${visualDescription || "No visual description available."}`;

  const res = await fetch(`${GROQ_API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 1024,
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
    captions = {
      yt_video_title: fileName.replace(/\.[^/.]+$/, "").slice(0, 60),
      yt_video_description: cleaned.slice(0, 300),
      fb_ig_caption: "",
      tiktok_caption: "",
      linkedin_caption: "",
    };
  }

  emit(onProgress, "generating-captions", 100);
  return {
    yt_video_title: (captions.yt_video_title || fileName.replace(/\.[^/.]+$/, "").slice(0, 60)).slice(0, 100),
    yt_video_description: (captions.yt_video_description || "").slice(0, 1000),
    fb_ig_caption: (captions.fb_ig_caption || "").slice(0, 500),
    tiktok_caption: (captions.tiktok_caption || "").slice(0, 500),
    linkedin_caption: (captions.linkedin_caption || "").slice(0, 1000),
  };
}

export interface GenerateCaptionsOptions {
  item: {
    id: string;
    file_name: string;
    mime_type: string | null;
  };
  masterPrompt?: MasterPrompt | null;
  onProgress?: OnProgress;
}

export async function generateAICaptions(options: GenerateCaptionsOptions): Promise<Record<string, string>> {
  const { item, masterPrompt, onProgress } = options;
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
      const fileToken = await getFileToken(item.id);
      videoBlob = await downloadVideo(fileToken);
    } catch (err) {
      console.error("[captions] FAIL download", err);
      throw new Error(`download: ${err instanceof Error ? err.message : String(err)}`);
    }
    emit(onProgress, "downloading", 100);

    let ffmpegInstance: FFmpeg;
    try {
      ffmpegInstance = await loadFFmpeg(onProgress);
    } catch (err) {
      console.error("[captions] FAIL loadFFmpeg", err);
      throw new Error(`ffmpeg: ${err instanceof Error ? err.message : String(err)}`);
    }

    let audioBlob: Blob; let frames: string[];
    try {
      ({ audioBlob, frames } = await extractAudioAndFrames(ffmpegInstance, videoBlob, item.file_name, onProgress));
    } catch (err) {
      console.error("[captions] FAIL extractAudioAndFrames", err);
      throw new Error(`extract: ${err instanceof Error ? err.message : String(err)}`);
    }

    let transcript: string;
    try {
      transcript = await groqWhisper(audioBlob, apiKey, onProgress);
    } catch (err) {
      console.error("[captions] FAIL groqWhisper", err);
      throw new Error(`whisper: ${err instanceof Error ? err.message : String(err)}`);
    }

    let visualDescription: string;
    try {
      visualDescription = await groqDescribeFrames(frames, apiKey, onProgress);
    } catch (err) {
      console.error("[captions] FAIL groqDescribeFrames", err);
      throw new Error(`vision: ${err instanceof Error ? err.message : String(err)}`);
    }

    let captions: Record<string, string>;
    try {
      captions = await groqGenerateCaptions(transcript, visualDescription, item.file_name, prompt, apiKey, onProgress);
    } catch (err) {
      console.error("[captions] FAIL groqGenerateCaptions", err);
      throw new Error(`generate: ${err instanceof Error ? err.message : String(err)}`);
    }

    emit(onProgress, "done", 100);
    return captions;
  } catch (err) {
    emit(onProgress, "error", 0);
    throw err;
  }
}
