import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import { decrypt, encrypt } from "../_shared/crypto.ts";
import { PROMPT_TEMPLATES, getDefaultMasterPrompt } from "./prompt-templates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://yourdomain.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const FRONTEND_API_KEY = Deno.env.get("FRONTEND_API_KEY");
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

const isAuthorized =
  (bearerToken: string | null, apiKeyHeader: string | null) =>
    bearerToken === SUPABASE_SERVICE_ROLE_KEY ||
    bearerToken === FRONTEND_API_KEY ||
    apiKeyHeader === FRONTEND_API_KEY;

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

const PLATFORM_ALLOWED_KEYS: Record<string, string[]> = {
  youtube: ["yt_video_title", "yt_video_description"],
  facebook: ["fb_ig_caption", "caption"],
  instagram: ["fb_ig_caption", "caption"],
  tiktok: ["tiktok_caption"],
  linkedin: ["linkedin_caption"],
};

async function generateCaptions(
  transcript: string,
  masterPrompt: Record<string, unknown>,
  fileName: string,
  platforms?: string[],
): Promise<Record<string, string>> {
  const rawPrompt = masterPrompt.raw_prompt as string | undefined;
  const promptJson = rawPrompt
    ? JSON.stringify(JSON.parse(rawPrompt), null, 2)
    : JSON.stringify(masterPrompt, null, 2);

  const platformHint = platforms?.length
    ? `\n\nIMPORTANT: Only generate captions for these platforms: ${platforms.join(", ")}.`
    : "";

  const systemPrompt = `You are an expert social media content strategist. Generate captions for a video file named "${fileName}".

Follow this prompt template EXACTLY — return valid JSON matching the output_format below.

${promptJson}
${platformHint}

Return ONLY valid JSON — no markdown, no code fences, no explanation.`;

  const userMessage = `Video transcript:\n\n${transcript || "No transcript available — generate captions based on the file name and general best practices."}`;

  const chatRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
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
    return {};
  }

  if (platforms?.length) {
    const allowed = new Set(platforms.flatMap((p) => PLATFORM_ALLOWED_KEYS[p] || []));
    for (const key of Object.keys(captions)) {
      if (!allowed.has(key)) delete captions[key];
    }
  }

  return captions;
}

async function getDriveAccount(userId: string, driveAccountId?: string | null) {
  let query = supabase
    .from("connected_accounts")
    .select("*")
    .eq("user_id", userId)
    .eq("platform", "google_drive")
    .eq("is_connected", true);

  if (driveAccountId) {
    query = query.eq("id", driveAccountId);
  }

  return await query.maybeSingle();
}

async function getDriveToken(userId: string, driveAccountId?: string | null): Promise<string | null> {
  const { data: driveAccount } = await getDriveAccount(userId, driveAccountId);
  if (!driveAccount?.access_token) return null;

  const tokenExpiry = driveAccount.token_expiry ? new Date(driveAccount.token_expiry) : null;
  if (tokenExpiry && tokenExpiry.getTime() - Date.now() < 5 * 60 * 1000) {
    // Token expiring soon — refresh it
    const rawRefresh = await decrypt(driveAccount.refresh_token as string);
    if (rawRefresh) {
      try {
        const refreshUrl = `${SUPABASE_URL}/functions/v1/google-drive-auth?action=refresh&user_id=${userId}${driveAccountId ? `&account_id=${driveAccountId}` : ""}`;
        const refreshRes = await fetch(
          refreshUrl,
          { headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } },
        );
        if (refreshRes.ok) {
          // Re-fetch the updated token
          let refreshQuery = supabase
            .from("connected_accounts")
            .select("access_token")
            .eq("user_id", userId)
            .eq("platform", "google_drive");
          if (driveAccountId) {
            refreshQuery = refreshQuery.eq("id", driveAccountId);
          }
          const { data: refreshed } = await refreshQuery.single();
          if (refreshed?.access_token) return await decrypt(refreshed.access_token as string);
        }
      } catch (e) {
        console.warn(`Drive token refresh failed for user ${userId}:`, e);
      }
    }
  }

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
  const apiKeyHeader = req.headers.get("apikey");
  const bearerToken = authHeader?.replace("Bearer ", "");

  if (!isAuthorized(bearerToken, apiKeyHeader)) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: { mode?: string; workflow_item_id?: string; template_name?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  // --- GET-KEY mode: return Groq API key to client ---
  if (body.mode === "get-key") {
    if (!GROQ_API_KEY) {
      return json({ error: "Groq API key not configured" }, 500);
    }
    return json({ key: GROQ_API_KEY });
  }

  // --- GET-FILE-TOKEN mode: return encrypted token for get-file edge function ---
  if (body.mode === "get-file-token") {
    const itemId = body.workflow_item_id;
    if (!itemId) {
      return json({ error: "workflow_item_id is required" }, 400);
    }

    try {
      const { data: item, error: itemError } = await supabase
        .from("workflow_items")
        .select("id, drive_file_id, workflow_id")
        .eq("id", itemId)
        .single();

      if (itemError || !item) {
        return json({ error: "Workflow item not found" }, 404);
      }

      const { data: workflow, error: wfError } = await supabase
        .from("workflows")
        .select("user_id, drive_account_id")
        .eq("id", item.workflow_id)
        .single();

      if (wfError || !workflow) {
        return json({ error: "Workflow not found" }, 404);
      }

      const driveToken = await getDriveToken(workflow.user_id, workflow.drive_account_id);
      if (!driveToken) {
        return json({ error: "No Google Drive token available" }, 400);
      }

      const driveUrl = `https://www.googleapis.com/drive/v3/files/${item.drive_file_id}?alt=media`;
      const tokenPayload = JSON.stringify({
        driveUrl,
        driveToken,
        driveAccountId: workflow.drive_account_id,
        userId: workflow.user_id,
        exp: Date.now() + 30 * 60 * 1000, // 30 min expiry
      });
      const encrypted = await encrypt(tokenPayload);

      return json({ token: encrypted });
    } catch (err) {
      console.error("get-file-token error", err);
      return json(
        { error: err instanceof Error ? err.message : "Unknown error" },
        500,
      );
    }
  }

  // --- GENERATE mode (original behavior) ---
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

    let masterPrompt: Record<string, unknown> = { ...getDefaultMasterPrompt() };
    if (workflow.caption_master_prompt) {
      const stored = workflow.caption_master_prompt as Record<string, unknown>;
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

    const wfPlatforms = (workflow.platforms as string[]) ?? [];
    const captions = await generateCaptions(transcript, masterPrompt, item.file_name, wfPlatforms);

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
