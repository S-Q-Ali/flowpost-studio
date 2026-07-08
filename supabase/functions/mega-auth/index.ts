import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import { Storage as MegaStorage, File as MegaFile } from "npm:megajs";
import { encrypt, decrypt } from "../_shared/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://yourdomain.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for mega-auth");
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

  const url = new URL(req.url);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const action = (body.action as string) || url.searchParams.get("action");

  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  const validKeys = [Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), Deno.env.get("SUPABASE_ANON_KEY"), Deno.env.get("FRONTEND_API_KEY")].filter(Boolean);
  if (!token || !validKeys.includes(token)) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    if (!action) return json({ error: "Missing action" }, 400);

    if (action === "connect") {
      const { email, password, userId } = body as { email?: string; password?: string; userId?: string };
      if (!email || !password || !userId) {
        return json({ error: "Missing email, password, or userId" }, 400);
      }

      let storage: InstanceType<typeof MegaStorage>;
      try {
        storage = await new MegaStorage({ email, password }).ready;
      } catch {
        return json({ error: "Invalid Mega credentials" }, 401);
      }

      const accountId = email;
      const accountName = email;

      const { error: upsertError } = await supabaseAdmin
        .from("connected_accounts")
        .upsert(
          {
            user_id: userId,
            platform: "mega",
            account_name: accountName,
            account_id: accountId,
            access_token: await encrypt(password),
            refresh_token: await encrypt(email),
            is_connected: true,
            connected_at: new Date().toISOString(),
          },
          { onConflict: "user_id,platform,account_id" },
        );

      if (upsertError) throw upsertError;

      const files = (storage.root.children ?? [])
        .filter((c: any) => !c.directory)
        .map((c: any) => ({
          name: c.name,
          size: c.size,
          handle: c.hash || c.nodeId,
        }));

      try { storage.api?.logout?.(); } catch {}

      return json({ success: true, accountId, email, files });
    }

    if (action === "files") {
      const accountIdParam = (body as { account_id?: string }).account_id || url.searchParams.get("account_id");
      if (!accountIdParam) return json({ error: "Missing account_id" }, 400);

      const { data: account, error: fetchError } = await supabaseAdmin
        .from("connected_accounts")
        .select("*")
        .eq("id", accountIdParam)
        .eq("platform", "mega")
        .eq("is_connected", true)
        .single();

      if (fetchError || !account) return json({ error: "Mega account not found" }, 404);

      const email = await decrypt(account.refresh_token as string);
      const password = await decrypt(account.access_token as string);
      if (!email || !password) return json({ error: "Missing credentials" }, 400);

      let storage: InstanceType<typeof MegaStorage>;
      try {
        storage = await new MegaStorage({ email, password }).ready;
      } catch {
        return json({ error: "Failed to login to Mega" }, 401);
      }

      const files = (storage.root.children ?? [])
        .filter((c: any) => !c.directory)
        .map((c: any) => ({
          name: c.name,
          size: c.size,
          handle: c.hash || c.nodeId,
        }));

      try { storage.api?.logout?.(); } catch {}

      return json({ success: true, files });
    }

    if (action === "disconnect") {
      const { accountId } = body as { accountId?: string };
      if (!accountId) return json({ error: "Missing accountId" }, 400);

      const { error: updateError } = await supabaseAdmin
        .from("connected_accounts")
        .update({ is_connected: false })
        .eq("id", accountId)
        .eq("platform", "mega");

      if (updateError) throw updateError;

      return json({ success: true });
    }

    return json({ error: "Invalid action" }, 400);
  } catch (err) {
    console.error("mega-auth error", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});