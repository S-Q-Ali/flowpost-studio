import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import { Storage as MegaStorage } from "npm:megajs";
import { encrypt, decrypt } from "../_shared/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://yourdomain.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for transfer-ticket");
}

const supabaseAdmin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
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

  // 1. Validate API key (same pattern as other functions)
  const authHeader = req.headers.get("Authorization");
  const apiToken = authHeader?.replace("Bearer ", "");
  const validKeys = [Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), Deno.env.get("SUPABASE_ANON_KEY"), Deno.env.get("FRONTEND_API_KEY")].filter(Boolean);
  if (!apiToken || !validKeys.includes(apiToken)) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: { sessionToken?: string; driveAccountId?: string; megaAccountId?: string; megaFolderPath?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { sessionToken, driveAccountId, megaAccountId, megaFolderPath } = body;

  if (!sessionToken || !driveAccountId || !megaAccountId) {
    return json({ error: "Missing sessionToken, driveAccountId, or megaAccountId" }, 400);
  }

  // 2. Validate session token and resolve userId
  const { data: session, error: sessionError } = await supabaseAdmin
    .from("sessions")
    .select("id, user_id")
    .eq("token", sessionToken)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (sessionError || !session) {
    return json({ error: "Invalid or expired session" }, 401);
  }

  const userId = session.user_id;

  // 3. Fetch and verify Drive account belongs to user
  const { data: driveAccount, error: driveError } = await supabaseAdmin
    .from("connected_accounts")
    .select("*")
    .eq("id", driveAccountId)
    .eq("platform", "google_drive")
    .eq("is_connected", true)
    .eq("user_id", userId)
    .single();

  if (driveError || !driveAccount) {
    return json({ error: "Drive account not found or not owned by user" }, 404);
  }

  // 4. Decrypt Drive token and refresh if possible
  let googleAccessToken = await decrypt(driveAccount.access_token as string);
  if (driveAccount.refresh_token) {
    const rawRefresh = await decrypt(driveAccount.refresh_token as string);
    if (rawRefresh) {
      try {
        const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: Deno.env.get("GD_CLIENT_ID")!,
            client_secret: Deno.env.get("GD_CLIENT_SECRET")!,
            refresh_token: rawRefresh,
            grant_type: "refresh_token",
          }),
        });
        const refreshJson = await refreshRes.json();
        if (refreshRes.ok && refreshJson.access_token) {
          googleAccessToken = refreshJson.access_token;
          await supabaseAdmin
            .from("connected_accounts")
            .update({ access_token: await encrypt(refreshJson.access_token) })
            .eq("id", driveAccountId);
        }
      } catch { /* use existing token */ }
    }
  }

  if (!googleAccessToken) {
    return json({ error: "Could not resolve Drive access token" }, 400);
  }

  // 5. Fetch and verify Mega account belongs to user
  const { data: megaAccount, error: megaError } = await supabaseAdmin
    .from("connected_accounts")
    .select("*")
    .eq("id", megaAccountId)
    .eq("platform", "mega")
    .eq("is_connected", true)
    .eq("user_id", userId)
    .single();

  if (megaError || !megaAccount) {
    return json({ error: "Mega account not found or not owned by user" }, 404);
  }

  const megaEmail = await decrypt(megaAccount.refresh_token as string);
  const megaPassword = await decrypt(megaAccount.access_token as string);

  if (!megaEmail || !megaPassword) {
    return json({ error: "Missing Mega credentials" }, 400);
  }

  // 6. Login to Mega server-side, extract session (don't close — would invalidate sid)
  const megaStorage = await new MegaStorage({ email: megaEmail, password: megaPassword }).ready;
  const sessionData = megaStorage.toJSON();

  // 7. Return ticket with session data only (no plaintext password)
  return json({
    driveToken: googleAccessToken,
    megaSession: {
      key: sessionData.key,
      sid: sessionData.sid,
      user: sessionData.user,
    },
    megaFolderPath: megaFolderPath || undefined,
  });
});
