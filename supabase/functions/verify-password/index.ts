import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://yourdomain.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APP_PASSWORD = Deno.env.get("APP_PASSWORD");
const SB_URL = Deno.env.get("SB_URL");
const SB_SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY");

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;

const supabase = createClient(SB_URL!, SB_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function checkRateLimit(ip: string): Promise<{ allowed: boolean; remainingAttempts?: number; lockoutUntil?: string }> {
  const now = new Date().toISOString();
  
  const { data: rateLimit, error } = await supabase
    .from("rate_limits")
    .select("*")
    .eq("key", `verify-password:${ip}`)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error("Rate limit check error:", error);
    return { allowed: true };
  }

  if (!rateLimit) {
    return { allowed: true, remainingAttempts: MAX_ATTEMPTS };
  }

  if (new Date(rateLimit.reset_at) > new Date()) {
    return { 
      allowed: false, 
      lockoutUntil: rateLimit.reset_at,
      remainingAttempts: 0 
    };
  }

  const remaining = MAX_ATTEMPTS - rateLimit.attempts;
  return { allowed: remaining > 0, remainingAttempts: remaining };
}

async function recordFailedAttempt(ip: string) {
  const now = new Date();
  const key = `verify-password:${ip}`;
  
  const { data: existing } = await supabase
    .from("rate_limits")
    .select("*")
    .eq("key", key)
    .single();

  if (existing) {
    const newAttempts = existing.attempts + 1;
    if (newAttempts >= MAX_ATTEMPTS) {
      const lockoutUntil = new Date(now.getTime() + LOCKOUT_DURATION_MINUTES * 60 * 1000);
      await supabase
        .from("rate_limits")
        .update({ 
          attempts: newAttempts, 
          reset_at: lockoutUntil.toISOString() 
        })
        .eq("key", key);
    } else {
      await supabase
        .from("rate_limits")
        .update({ attempts: newAttempts })
        .eq("key", key);
    }
  } else {
    await supabase
      .from("rate_limits")
      .insert({ 
        key, 
        attempts: 1, 
        reset_at: now.toISOString() 
      });
  }
}

async function resetRateLimit(ip: string) {
  const key = `verify-password:${ip}`;
  await supabase
    .from("rate_limits")
    .delete()
    .eq("key", key);
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
    const rateCheck = await checkRateLimit(ip);
    
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
      await resetRateLimit(ip);

      const token = crypto.randomUUID() + crypto.randomUUID();

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

    await recordFailedAttempt(ip);
    
    return json({ 
      success: false, 
      remainingAttempts: (rateCheck.remainingAttempts || MAX_ATTEMPTS) - 1 
    }, 401);
    
  } catch (err) {
    console.error("verify-password error", err);
    return json({ success: false, error: "Invalid request" }, 400);
  }
});