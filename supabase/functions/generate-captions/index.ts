const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://yourdomain.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function callGemini(prompt: string): Promise<string> {
  const geminiResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              text: prompt
            }
          ]
        }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 1000,
        }
      })
    }
  );

  if (!geminiResponse.ok) {
    const err = await geminiResponse.text();
    throw new Error(`Gemini API error: ${geminiResponse.status} ${err}`);
  }

  const geminiData = await geminiResponse.json();
  const captionText = geminiData?.candidates?.[0]
    ?.content?.parts?.[0]?.text ?? "";

  return captionText;
}

const YOUTUBE_PROMPT = (title: string, containsAlteredContent: boolean) => `You are a YouTube content strategist. Analyze this video title and generate an optimized YouTube description.

Video Title: ${title}
Contains AI/Altered Content: ${containsAlteredContent}

Generate a YouTube description following this exact style example:
'He didn't bark. He didn't hesitate. In a single second, this dog changed everything. Moments like this remind us that true heroes don't always wear capes — sometimes they walk on four legs. Welcome to [Channel Name] — where powerful moments are brought to life through cinematic AI storytelling. Technology is the tool. Emotion is the purpose. #Tag1 #Tag2 #Tag3'

Rules:
- Start with 2-3 punchy hook sentences about the video content
- Add emotional/philosophical line
- Add channel welcome line mentioning it is cinematic AI storytelling if altered content is true
- End with 6-8 relevant hashtags
- Keep total under 500 words
- Make it engaging and emotional
- If altered content is true, naturally mention AI storytelling in description

Return ONLY the description text, nothing else.`;

const INSTAGRAM_PROMPT = (title: string) => `You are an Instagram content strategist. Analyze this video title and generate an optimized Instagram caption.

Video Title: ${title}

Rules:
- Start with a strong hook (1-2 lines)
- Add emotional storytelling (2-3 lines)
- Add call to action (follow, save, share)
- End with 15-20 relevant hashtags
- Use line breaks for readability
- Keep it conversational and emotional
- Total max 300 words

Return ONLY the caption text, nothing else.`;

const FACEBOOK_PROMPT = (title: string) => `You are a Facebook content strategist. Analyze this video title and generate an optimized Facebook post caption.

Video Title: ${title}

Rules:
- Start with an attention-grabbing question or statement
- Tell a mini story (3-4 lines)
- Add emotional connection
- End with 3-5 hashtags only (Facebook prefers fewer)
- Conversational friendly tone
- Total max 200 words

Return ONLY the caption text, nothing else.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  const validKeys = [Deno.env.get("SB_SERVICE_ROLE_KEY")];
  const token = authHeader?.replace("Bearer ", "");
  if (!token || !validKeys.includes(token)) {
    return json({ error: "Unauthorized" }, 401);
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  if (!GEMINI_API_KEY) {
    return json({ error: "GEMINI_API_KEY not configured" }, 500);
  }

  let body: { videoId?: string; title?: string; platforms?: string[]; containsAlteredContent?: boolean };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { videoId, title, platforms, containsAlteredContent = false } = body;
  if (!title || !platforms || !Array.isArray(platforms) || platforms.length === 0) {
    return json({ error: "title and platforms[] required" }, 400);
  }

  const result: Record<string, string> = {};

  try {
    if (platforms.includes("youtube")) {
      result.youtube = await callGemini(YOUTUBE_PROMPT(title, !!containsAlteredContent));
    }
    if (platforms.includes("instagram")) {
      result.instagram = await callGemini(INSTAGRAM_PROMPT(title));
    }
    if (platforms.includes("facebook")) {
      result.facebook = await callGemini(FACEBOOK_PROMPT(title));
    }
    return json({ ...result, videoId: videoId ?? null });
  } catch (err) {
    console.error("generate-captions error", err);
    return json(
      { error: err instanceof Error ? err.message : "Caption generation failed" },
      500,
    );
  }
});
