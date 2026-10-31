import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import { checkRateLimit, recordFailedAttempt, LOCKOUT_DURATION_MINUTES } from "../_shared/rate-limit.ts";
import { hashLicenseKey, isLicenseUsable, normalizeLicenseKey } from "../_shared/license.ts";
import { createSession } from "../_shared/session.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://flowpost-studio.vercel.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ADMIN_USER_ID_FALLBACK = "00000000-0000-0000-0000-000000000000";
const RATE_LIMIT_KEY = "verify-license";

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

async function getAdminUserId(): Promise<string> {
  const { data } = await supabase
    .from("users")
    .select("id")
    .eq("is_admin", true)
    .maybeSingle();
  return data?.id ?? ADMIN_USER_ID_FALLBACK;
}

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
    const rateCheck = await checkRateLimit(supabase, RATE_LIMIT_KEY, ip);
    if (!rateCheck.allowed) {
      const lockoutDate = rateCheck.lockoutUntil ? new Date(rateCheck.lockoutUntil) : null;
      const remainingMinutes = lockoutDate
        ? Math.max(1, Math.ceil((lockoutDate.getTime() - Date.now()) / 60000))
        : LOCKOUT_DURATION_MINUTES;
      return json({
        valid: false,
        error: `Too many attempts. Try again in ${remainingMinutes} minutes.`,
        lockoutUntil: rateCheck.lockoutUntil,
      }, 429);
    }

    const body = await req.json() as { licenseKey?: string };
    const key = normalizeLicenseKey(body?.licenseKey);
    if (!key) {
      await recordFailedAttempt(supabase, RATE_LIMIT_KEY, ip);
      return json({ valid: false, error: "Invalid license key" }, 400);
    }

    const keyHash = await hashLicenseKey(key);
    const { data: license, error } = await supabase
      .from("licenses")
      .select("id, active, expires_at, user_id")
      .eq("key_hash", keyHash)
      .maybeSingle();

    if (error) {
      console.error("verify-license lookup failed", error);
      return json({ valid: false, error: "License check failed" }, 500);
    }

    if (!license || !isLicenseUsable(license)) {
      await recordFailedAttempt(supabase, RATE_LIMIT_KEY, ip);
      return json({ valid: false, error: "Invalid license key" }, 401);
    }

    // A key bound to a user mints that user's session; a legacy key without
    // an owner keeps the admin fallback.
    const ownerId = (license as { user_id?: string | null }).user_id
      ?? await getAdminUserId();
    const { token, expiresAt } = await createSession(supabase, ownerId);

    await supabase
      .from("licenses")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", license.id);

    return json({ valid: true, token, expiresAt });
  } catch (err) {
    console.error("verify-license error", err);
    return json({ valid: false, error: "Invalid request" }, 400);
  }
});
