import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import { resolveAllowedRedirect } from "../_shared/url-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://flowpost-studio.vercel.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for google-oauth");
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    return json({ error: error }, 400);
  }

  if (!code) {
    return json({ error: "No authorization code provided" }, 400);
  }

  try {
    const { data: exchangeData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError || !exchangeData.user) {
      console.error("Token exchange failed:", exchangeError);
      return json({ error: "Failed to exchange code for session" }, 500);
    }

    const user = exchangeData.user;

    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    // Signups are closed: only a row that already exists may sign in.
    if (!existingUser) {
      return json({ error: "This account is not allowed to sign in" }, 403);
    }

    const token = crypto.randomUUID() + crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // Clear only this user's expired rows; a login must never sign out the
    // other sessions of the account or of anyone else.
    await supabase
      .from("sessions")
      .delete()
      .eq("user_id", user.id)
      .lt("expires_at", new Date().toISOString());

    const { error: sessionError } = await supabase
      .from("sessions")
      .insert({ 
        token, 
        expires_at: expiresAt,
        user_id: user.id
      });

    if (sessionError) {
      console.error("Failed to create session:", sessionError);
    }

    const appOrigin = Deno.env.get("ALLOWED_ORIGIN") || "https://flowpost-studio.vercel.app";
    const rawRedirect = url.searchParams.get("redirect_uri") || "/";
    const target = resolveAllowedRedirect(rawRedirect, appOrigin, [
      "https://flowpost-studio.vercel.app",
      appOrigin,
      "http://localhost:5173",
      "http://localhost:3000",
    ]);
    if (!target) {
      return json({ error: "Invalid redirect_uri" }, 400);
    }
    // The fragment keeps the token out of server logs, Referer headers and
    // the browser history entry's query string.
    target.hash = `token=${token}`;

    return new Response(null, {
      status: 302,
      headers: {
        "Location": target.toString(),
        ...corsHeaders,
      },
    });
  } catch (err) {
    console.error("google-oauth error:", err);
    return json({ error: "OAuth failed" }, 500);
  }
});


