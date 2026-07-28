import { createClient } from "npm:@supabase/supabase-js@2.49.0";

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
    const email = user.email;
    const name = user.user_metadata?.full_name || user.user_metadata?.name || email;
    const avatarUrl = user.user_metadata?.avatar_url || null;

    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("id", user.id)
      .single();

    if (!existingUser) {
      const { error: insertError } = await supabase
        .from("users")
        .insert({
          id: user.id,
          email: email,
          name: name,
          avatar_url: avatarUrl,
          is_admin: false,
        });

      if (insertError) {
        console.error("Failed to create user record:", insertError);
      }
    }

    const token = crypto.randomUUID() + crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    await supabase.from("sessions").delete().neq("id", "00000000-0000-0000-0000-000000000000");

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

    const rawRedirect = url.searchParams.get("redirect_uri") || "/";
    // Allow relative paths or known origins only
    if (rawRedirect.startsWith("http")) {
      const allowedOrigins = [
        "https://flowpost-studio.vercel.app",
        Deno.env.get("ALLOWED_ORIGIN"),
        "http://localhost:5173",
        "http://localhost:3000",
      ].filter((o): o is string => !!o);
      const parsedOrigin = new URL(rawRedirect).origin;
      if (!allowedOrigins.includes(parsedOrigin)) {
        return json({ error: "Invalid redirect_uri origin" }, 400);
      }
    }
    const redirectUrl = `${rawRedirect}?token=${token}`;
    
    return new Response(null, {
      status: 302,
      headers: {
        "Location": redirectUrl,
        ...corsHeaders,
      },
    });
  } catch (err) {
    console.error("google-oauth error:", err);
    return json({ error: "OAuth failed" }, 500);
  }
});


