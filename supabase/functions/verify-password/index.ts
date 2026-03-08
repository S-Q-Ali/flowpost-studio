import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APP_PASSWORD = Deno.env.get("APP_PASSWORD");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const correctPassword = APP_PASSWORD;
    if (!correctPassword) {
      console.error("APP_PASSWORD secret not set");
      return json({ success: false, error: "Server misconfiguration" }, 500);
    }

    const body = await req.json() as { password?: string };
    const password = body?.password;

    if (password === correctPassword) {
      const token =
        crypto.randomUUID() + crypto.randomUUID();

      const expiresAt = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000,
      ).toISOString();

      const { error } = await supabase
        .from("sessions")
        .insert({ token, expires_at: expiresAt });

      if (error) {
        console.error("Session insert error:", error);
        return json({ success: false, error: "Failed to create session" }, 500);
      }

      return json({ success: true, token });
    }

    return json({ success: false }, 401);
  } catch (err) {
    console.error("verify-password error", err);
    return json({ success: false, error: "Invalid request" }, 400);
  }
});
