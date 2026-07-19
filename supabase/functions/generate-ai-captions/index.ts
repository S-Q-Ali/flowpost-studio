import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import { decrypt } from "../_shared/crypto.ts";
import { PROMPT_TEMPLATES, getDefaultMasterPrompt } from "./prompt-templates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://yourdomain.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for generate-ai-captions");
}
if (!GROQ_API_KEY) {
  console.error("Missing GROQ_API_KEY — caption generation will fail");
}

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function transcribeAudio(audioUrl: string, mimeType: string, driveToken: string): Promise<string> {
  const response = await fetch(audioUrl, {
    headers: { Authorization: `Bearer ${driveToken}` },
  });
  if (!response.ok) throw new Error(`Failed to fetch audio file: ${response.status}`);
  const blob = await response.blob();

  const formData = new FormData();
  const ext = mimeType === "audio/mpeg" ? "mp3" : mimeType === "audio/wav" ? "wav" : "mp4";
  formData.append("file", blob, `audio.${ext}`);
  formData.append("model", "whisper-large-v3-turbo");
  formData.append("response_format", "text");

  const groqRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
    body: formData,
  });

  if (!groqRes.ok) {
    const errText = await groqRes.text();
    throw new Error(`Groq Whisper error (${groqRes.status}): ${errText}`);
  }

  return await groqRes.text();
}

async function generateCaptions(
  transcript: string,
  masterPrompt: Record<string, string>,
  fileName: string,
): Promise<Record<string, string>> {
  const systemPrompt = `You are an expert social media content strategist. Generate platform-optimized captions for a video file named "${fileName}".

## STRICT RULES
${masterPrompt.strict_rules || "Follow the output format exactly."}

## OUTPUT FORMAT
${masterPrompt.output_format || "Return JSON with yt_video_title, yt_video_description, fb_ig_caption, tiktok_caption, linkedin_caption."}

## EXAMPLE OUTPUT
${masterPrompt.example_output || "See the generation instruction below."}

## DEFAULT HASHTAGS
${masterPrompt.hashtags || ""}

## GENERATION INSTRUCTION
${masterPrompt.generation_instruction || "Generate captions based on the transcript."}

Return ONLY valid JSON — no markdown, no code fences, no explanation.`;

  const userMessage = `Video transcript:\n\n${transcript || "No transcript available — generate captions based on the file name and general best practices."}`;

  const chatRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
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

  if (!chatRes.ok) {
    const errText = await chatRes.text();
    throw new Error(`Groq Llama error (${chatRes.status}): ${errText}`);
  }

  const chatData = await chatRes.json();
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

  return {
    yt_video_title: (captions.yt_video_title || fileName.replace(/\.[^/.]+$/, "").slice(0, 60)).slice(0, 100),
    yt_video_description: (captions.yt_video_description || "").slice(0, 1000),
    fb_ig_caption: (captions.fb_ig_caption || "").slice(0, 500),
    tiktok_caption: (captions.tiktok_caption || "").slice(0, 500),
    linkedin_caption: (captions.linkedin_caption || "").slice(0, 1000),
  };
}

async function getDriveToken(userId: string, driveAccountId?: string | null): Promise<string | null> {
  let query = supabase
    .from("connected_accounts")
    .select("*")
    .eq("user_id", userId)
    .eq("platform", "google_drive")
    .eq("is_connected", true);

  if (driveAccountId) {
    query = query.eq("id", driveAccountId);
  }

  const { data: driveAccount } = await query.maybeSingle();
  if (!driveAccount?.access_token) return null;
  return await decrypt(driveAccount.access_token as string);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  const bearerToken = authHeader?.replace("Bearer ", "");
  const isAuthorized =
    bearerToken === SUPABASE_SERVICE_ROLE_KEY ||
    bearerToken === SUPABASE_ANON_KEY;

  if (!isAuthorized) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: { workflow_item_id?: string; template_name?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const itemId = body.workflow_item_id;
  if (!itemId) {
    return json({ error: "workflow_item_id is required" }, 400);
  }

  try {
    const { data: item, error: itemError } = await supabase
      .from("workflow_items")
      .select("*")
      .eq("id", itemId)
      .single();

    if (itemError || !item) {
      return json({ error: "Workflow item not found" }, 404);
    }

    const { data: workflow, error: wfError } = await supabase
      .from("workflows")
      .select("*")
      .eq("id", item.workflow_id)
      .single();

    if (wfError || !workflow) {
      return json({ error: "Workflow not found" }, 404);
    }

    let masterPrompt: Record<string, string> = getDefaultMasterPrompt();
    if (workflow.caption_master_prompt) {
      const stored = workflow.caption_master_prompt as Record<string, string>;
      if (body.template_name && body.template_name !== "custom") {
        const template = PROMPT_TEMPLATES.find((t) => t.name === body.template_name);
        if (template) {
          masterPrompt = { ...masterPrompt, ...template.prompt, ...stored };
        } else {
          masterPrompt = { ...masterPrompt, ...stored };
        }
      } else {
        masterPrompt = { ...masterPrompt, ...stored };
      }
    } else if (body.template_name) {
      const template = PROMPT_TEMPLATES.find((t) => t.name === body.template_name);
      if (template) {
        masterPrompt = { ...masterPrompt, ...template.prompt };
      }
    }

    const driveToken = await getDriveToken(workflow.user_id, workflow.drive_account_id);
    if (!driveToken) {
      return json({ error: "No Google Drive token available" }, 400);
    }

    const downloadUrl = `https://www.googleapis.com/drive/v3/files/${item.drive_file_id}?alt=media`;
    const mimeType = item.mime_type || "video/mp4";

    const transcript = await transcribeAudio(downloadUrl, mimeType, driveToken);

    const captions = await generateCaptions(transcript, masterPrompt, item.file_name);

    return json({
      item_id: itemId,
      captions,
      transcript: transcript.slice(0, 2000),
    });
  } catch (err) {
    console.error("generate-ai-captions error", err);
    return json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      500,
    );
  }
});
