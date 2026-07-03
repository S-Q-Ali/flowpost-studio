import { createClient } from "npm:@supabase/supabase-js@2.49.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://yourdomain.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ADMIN_USER_ID_FALLBACK = "00000000-0000-0000-0000-000000000000";

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

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;

async function checkRateLimit(ip: string): Promise<{ allowed: boolean; remainingAttempts?: number; lockoutUntil?: string }> {
  const now = new Date().toISOString();

  const { data: rateLimit, error } = await supabase
    .from("rate_limits")
    .select("*")
    .eq("key", `verify-security-questions:${ip}`)
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
      remainingAttempts: 0,
    };
  }

  const remaining = MAX_ATTEMPTS - rateLimit.attempts;
  return { allowed: remaining > 0, remainingAttempts: remaining };
}

async function recordFailedAttempt(ip: string) {
  const now = new Date();
  const key = `verify-security-questions:${ip}`;

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
        .update({ attempts: newAttempts, reset_at: lockoutUntil.toISOString() })
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
      .insert({ key, attempts: 1, reset_at: now.toISOString() });
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function createAdminSession(): Promise<string> {
  const token = crypto.randomUUID() + crypto.randomUUID();
  const expiresAt = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { error } = await supabase
    .from("sessions")
    .insert({ token, expires_at: expiresAt, user_id: await getAdminUserId() });

  if (error) {
    console.error("Failed to create admin session:", error);
    throw new Error("Session creation failed");
  }

  return token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")
    || "unknown";

  if (req.method === "POST") {
    try {
      const rateCheck = await checkRateLimit(ip);
      if (!rateCheck.allowed) {
        const lockoutDate = new Date(rateCheck.lockoutUntil!);
        const remainingMinutes = Math.ceil((lockoutDate.getTime() - Date.now()) / 60000);
        return json({
          success: false,
          error: `Too many failed attempts. Try again in ${remainingMinutes} minutes.`,
          lockoutUntil: rateCheck.lockoutUntil,
        }, 429);
      }

      const body = await req.json() as {
        action?: string;
        favTeacher?: string;
        bestNightDate?: string;
        setQuestions?: boolean;
      };

      const { action, favTeacher, bestNightDate, setQuestions } = body;

      if (setQuestions) {
        if (!favTeacher || !bestNightDate) {
          return json({ success: false, error: "Both questions are required" }, 400);
        }

        const { error: updateError } = await supabase
          .from("users")
          .update({
            fav_teacher: favTeacher.trim().toLowerCase(),
            best_night_date: bestNightDate,
          })
          .eq("id", await getAdminUserId());

        if (updateError) {
          console.error("Failed to set security questions:", updateError);
          return json({ success: false, error: "Failed to set security questions" }, 500);
        }

        return json({ success: true, message: "Security questions updated" });
      }

      if (action === "verify") {
        if (!favTeacher || !bestNightDate) {
          return json({ success: false, error: "Both answers required" }, 400);
        }

        const { data: admin, error: fetchError } = await supabase
          .from("users")
          .select("fav_teacher, best_night_date")
          .eq("id", await getAdminUserId())
          .single();

        if (fetchError || !admin) {
          console.error("Failed to fetch admin:", fetchError);
          return json({ success: false, error: "Admin not found" }, 404);
        }

        const favTeacherMatch = admin.fav_teacher &&
          admin.fav_teacher.toLowerCase() === favTeacher.trim().toLowerCase();

        const bestNightMatch = admin.best_night_date &&
          admin.best_night_date === bestNightDate;

        if (favTeacherMatch && bestNightMatch) {
          const token = await createAdminSession();
          return json({ success: true, verified: true, token });
        }

        await recordFailedAttempt(ip);
        return json({ success: false, verified: false, error: "Incorrect answers" }, 401);
      }

      return json({ error: "Invalid action" }, 400);
    } catch (err) {
      console.error("verify-security-questions error", err);
      return json({ success: false, error: "Invalid request" }, 400);
    }
  }

  if (req.method === "GET") {
    try {
      const { data: admin } = await supabase
        .from("users")
        .select("fav_teacher, best_night_date")
        .eq("id", await getAdminUserId())
        .single();

      const hasQuestions = !!(admin?.fav_teacher && admin?.best_night_date);

      return json({
        hasQuestions,
        questionsConfigured: hasQuestions,
      });
    } catch (err) {
      return json({ hasQuestions: false, questionsConfigured: false });
    }
  }

  return json({ error: "Method not allowed" }, 405);
});
