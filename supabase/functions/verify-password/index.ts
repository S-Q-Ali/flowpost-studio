import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import { checkRateLimit, recordFailedAttempt, resetRateLimit, MAX_ATTEMPTS } from "../_shared/rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://flowpost-studio.vercel.app",
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

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() 
    || req.headers.get("x-real-ip") 
    || "unknown";

  try {
    const rateCheck = await checkRateLimit(supabase, "verify-password", ip);
    
    if (!rateCheck.allowed) {
      const lockoutDate = new Date(rateCheck.lockoutUntil!);
      const remainingMinutes = Math.ceil((lockoutDate.getTime() - Date.now()) / 60000);
      return json({ 
        success: false, 
        error: `Too many failed attempts. Try again in ${remainingMinutes} minutes.`,
        lockoutUntil: rateCheck.lockoutUntil
      }, 429);
    }

    const correctPassword = APP_PASSWORD;
    if (!correctPassword) {
      console.error("APP_PASSWORD secret not set");
      return json({ success: false, error: "Server misconfiguration" }, 500);
    }

    const body = await req.json() as { password?: string };
    const password = body?.password;

    if (!password) {
      return json({ success: false, error: "Password is required" }, 400);
    }

    if (password === correctPassword) {
      await resetRateLimit(supabase, "verify-password", ip);

      const token = crypto.randomUUID() + crypto.randomUUID();

      const expiresAt = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000,
      ).toISOString();

      await supabase.from("sessions").delete().neq("id", "00000000-0000-0000-0000-000000000000");

      const { error } = await supabase
        .from("sessions")
        .insert({ token, expires_at: expiresAt });

      if (error) {
        console.error("Session insert error:", error);
        return json({ success: false, error: "Failed to create session" }, 500);
      }

      return json({ success: true, token });
    }

    await recordFailedAttempt(supabase, "verify-password", ip);
    
    return json({ 
      success: false, 
      remainingAttempts: (rateCheck.remainingAttempts || MAX_ATTEMPTS) - 1 
    }, 401);
    
  } catch (err) {
    console.error("verify-password error", err);
    return json({ success: false, error: "Invalid request" }, 400);
  }
});
