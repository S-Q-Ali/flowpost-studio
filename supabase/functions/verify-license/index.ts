import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import { consumeRateLimit, type RateLimitResult } from "../_shared/rate-limit.ts";
import {
  hashLicenseKey,
  isLicenseUsable,
  MIN_LICENSE_PEPPER_LENGTH,
  normalizeLicenseKey,
} from "../_shared/license.ts";
import { createSession } from "../_shared/session.ts";
import { findAdminUserId } from "../_shared/admin-user.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://flowpost-studio.vercel.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const LICENSE_PEPPER = Deno.env.get("LICENSE_PEPPER") || "";

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const UNAVAILABLE = "The license check is unavailable. Try again shortly.";

/** The refusal for a spent bucket, or null when the attempt may go on. */
function refused(rate: RateLimitResult): Response | null {
  if (rate.allowed) return null;
  if (!rate.resetAt) {
    return json({ valid: false, error: UNAVAILABLE }, 503);
  }
  const minutes = Math.max(
    1,
    Math.ceil((new Date(rate.resetAt).getTime() - Date.now()) / 60000),
  );
  return json({
    valid: false,
    error: `Too many attempts. Try again in ${minutes} minutes.`,
    lockoutUntil: rate.resetAt,
  }, 429);
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
    // Without the pepper every stored hash was made another way, so answering
    // here could only produce false negatives.
    if (LICENSE_PEPPER.length < MIN_LICENSE_PEPPER_LENGTH) {
      console.error("verify-license: LICENSE_PEPPER is unset or too short");
      return json({ valid: false, error: UNAVAILABLE }, 503);
    }

    // Every attempt counts against both buckets: the caller's IP, so one
    // machine cannot guess in a loop, and the key itself, so many machines
    // cannot guess one key.
    const ipRefusal = refused(
      await consumeRateLimit(supabase, `verify-license:ip:${ip}`, { max: 10 }),
    );
    if (ipRefusal) return ipRefusal;

    const body = await req.json() as { licenseKey?: string };
    const key = normalizeLicenseKey(body?.licenseKey);
    if (!key) {
      return json({ valid: false, error: "Invalid license key" }, 400);
    }

    const keyHash = await hashLicenseKey(key, LICENSE_PEPPER);
    const keyRefusal = refused(
      await consumeRateLimit(supabase, `verify-license:key:${keyHash}`, { max: 10 }),
    );
    if (keyRefusal) return keyRefusal;

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
      return json({ valid: false, error: "Invalid license key" }, 401);
    }

    // A key bound to a user mints that user's session; a legacy key with no
    // owner signs in as the admin — and with no admin row there is nobody to
    // sign in as, so say the check is down rather than mint a phantom owner.
    const ownerId = (license as { user_id?: string | null }).user_id
      ?? await findAdminUserId(supabase);
    if (!ownerId) {
      console.error("verify-license: no admin user configured for a legacy license");
      return json({ valid: false, error: UNAVAILABLE }, 503);
    }
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
