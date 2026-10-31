import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import { consumeRateLimit } from "../_shared/rate-limit.ts";
import { requireAdminCaller } from "../_shared/admin-caller.ts";
import { createSession } from "../_shared/session.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://flowpost-studio.vercel.app",
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

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function createAdminSession(): Promise<string> {
  const session = await createSession(supabase, await getAdminUserId());
  return session.token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const caller = await requireAdminCaller(req.headers.get("Authorization"), {
    resolveUserId: async (token) => {
      const { data, error } = await supabase.auth.getUser(token);
      return error ? { userId: null, error } : { userId: data.user?.id ?? null };
    },
    isAdmin: async (userId) => {
      const { data, error } = await supabase
        .from("users")
        .select("is_admin")
        .eq("id", userId)
        .maybeSingle();
      return error ? { admin: false, error } : { admin: data?.is_admin === true };
    },
  });

  if (!caller.allowed) {
    return json({ success: false, error: "Unauthorized" }, caller.status);
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")
    || "unknown";

  if (req.method === "POST") {
    try {
      const rateCheck = await consumeRateLimit(
        supabase,
        `verify-security-questions:ip:${ip}`,
        { max: 10 },
      );
      if (!rateCheck.allowed) {
        if (!rateCheck.resetAt) {
          return json(
            { success: false, error: "The sign-in check is unavailable. Try again shortly." },
            503,
          );
        }
        const remainingMinutes = Math.max(
          1,
          Math.ceil((new Date(rateCheck.resetAt).getTime() - Date.now()) / 60000),
        );
        return json({
          success: false,
          error: `Too many attempts. Try again in ${remainingMinutes} minutes.`,
          lockoutUntil: rateCheck.resetAt,
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
