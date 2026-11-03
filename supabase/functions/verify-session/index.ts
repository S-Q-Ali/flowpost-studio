import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import { consumeRateLimit } from "../_shared/rate-limit.ts";
import { revokeSession } from "../_shared/session.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://flowpost-studio.vercel.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")
    || "unknown";

  try {
    // Carrying a token is enough to end the session it belongs to — but that
    // also makes this a public endpoint that writes, so one machine cannot use
    // it to issue deletes in a loop.
    const rate = await consumeRateLimit(supabase, `verify-session:ip:${ip}`, { max: 30 });
    if (!rate.allowed) {
      return json({ error: "Too many attempts. Try again shortly." }, 429);
    }

    const body = (await req.json().catch(() => null)) as { token?: string; action?: string };
    const token = body?.token;
    if (!token) return json({ error: "Token required" }, 400);

    // Sessions are checked where they are used: every function that needs an
    // owner reads the session itself, so an endpoint that answers "is this
    // token live, and whose" would only be a way to look up other people's
    // user ids. Revoke is the one thing only this endpoint can do.
    if (body?.action !== "revoke") {
      return json({ error: "Unsupported action" }, 400);
    }

    await revokeSession(supabase, token);
    return json({ revoked: true });
  } catch (err) {
    console.error("verify-session error", err);
    return json({ error: "Session revoke failed" }, 502);
  }
});

