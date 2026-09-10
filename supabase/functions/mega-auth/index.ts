import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import { Storage as MegaStorage, File as MegaFile } from "npm:megajs";
import { encrypt, decrypt } from "../_shared/crypto.ts";
import { createRequestAuthorizer, createSessionLookup, resolveSessionOwner } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://flowpost-studio.vercel.app",
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

const authorize = createRequestAuthorizer({
  serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
  cronApiKey: null,
  frontendApiKey: Deno.env.get("FRONTEND_API_KEY"),
  anonKey: Deno.env.get("SUPABASE_ANON_KEY"),
  sessionLookup: createSessionLookup(supabaseAdmin),
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

  const auth = await authorize(req);
  if (!auth.allowed) {
    return json({ error: "Unauthorized" }, 401);
  }
  const sessionUserId = auth.kind === "session" ? auth.userId : null;

  try {
    if (!action) return json({ error: "Missing action" }, 400);

    if (action === "connect") {
      const { email, password, userId: bodyUserId } = body as { email?: string; password?: string; userId?: string };
      const owner = resolveSessionOwner(auth, bodyUserId);
      if (owner.denied) return json({ error: "Unauthorized" }, 401);
      const userId = owner.userId;
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

let accountQuery = supabaseAdmin
        .from("connected_accounts")
        .select("*")
        .eq("id", accountIdParam)
        .eq("platform", "mega")
        .eq("is_connected", true);
      if (sessionUserId) accountQuery = accountQuery.eq("user_id", sessionUserId);
      const { data: account, error: fetchError } = await accountQuery.single();

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

      let disconnectQuery = supabaseAdmin
        .from("connected_accounts")
        .update({ is_connected: false })
        .eq("id", accountId)
        .eq("platform", "mega");
      if (sessionUserId) disconnectQuery = disconnectQuery.eq("user_id", sessionUserId);
      const { error: updateError } = await disconnectQuery;

      if (updateError) throw updateError;

      return json({ success: true });
    }

    if (action === "quota") {
      const accountIdParam = (body as { account_id?: string }).account_id || url.searchParams.get("account_id");
      if (!accountIdParam) return json({ error: "Missing account_id" }, 400);

let accountQuery = supabaseAdmin
        .from("connected_accounts")
        .select("*")
        .eq("id", accountIdParam)
        .eq("platform", "mega")
        .eq("is_connected", true);
      if (sessionUserId) accountQuery = accountQuery.eq("user_id", sessionUserId);
      const { data: account, error: fetchError } = await accountQuery.single();

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

      const info = await storage.getAccountInfo();
      try { storage.api?.logout?.(); } catch {}

      return json({ spaceUsed: info.spaceUsed, spaceTotal: info.spaceTotal });
    }

    if (action === "list-items") {
      const accountIdParam = (body as { account_id?: string }).account_id || url.searchParams.get("account_id");
      const path = (body as { path?: string }).path || url.searchParams.get("path") || "";

      if (!accountIdParam) return json({ error: "Missing account_id" }, 400);

let accountQuery = supabaseAdmin
        .from("connected_accounts")
        .select("*")
        .eq("id", accountIdParam)
        .eq("platform", "mega")
        .eq("is_connected", true);
      if (sessionUserId) accountQuery = accountQuery.eq("user_id", sessionUserId);
      const { data: account, error: fetchError } = await accountQuery.single();

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

      let target = storage.root;
      if (path) {
        const resolved = target.navigate(path);
        if (!resolved) {
          try { storage.api?.logout?.(); } catch {}
          return json({ error: `Path not found: ${path}` }, 404);
        }
        target = resolved;
      }

      const children = target.children ?? [];
      const folders = children.filter((c: any) => c.directory).map((c: any) => ({ name: c.name, nodeId: c.nodeId }));
      const files = children.filter((c: any) => !c.directory).map((c: any) => ({
        name: c.name,
        size: c.size,
        nodeId: c.nodeId,
      }));

      try { storage.api?.logout?.(); } catch {}
      return json({ folders, files });
    }

    if (action === "create-folder") {
      const accountIdParam = (body as { account_id?: string }).account_id || url.searchParams.get("account_id");
      const path = (body as { path?: string }).path || url.searchParams.get("path") || "";
      const folderName = (body as { folderName?: string }).folderName || url.searchParams.get("folderName");

      if (!accountIdParam || !folderName) return json({ error: "Missing account_id or folderName" }, 400);

let accountQuery = supabaseAdmin
        .from("connected_accounts")
        .select("*")
        .eq("id", accountIdParam)
        .eq("platform", "mega")
        .eq("is_connected", true);
      if (sessionUserId) accountQuery = accountQuery.eq("user_id", sessionUserId);
      const { data: account, error: fetchError } = await accountQuery.single();

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

      let target = storage.root;
      if (path) {
        const resolved = target.navigate(path);
        if (!resolved) {
          try { storage.api?.logout?.(); } catch {}
          return json({ error: `Parent path not found: ${path}` }, 404);
        }
        target = resolved;
      }

      const newFolder = await target.mkdir(folderName);
      try { storage.api?.logout?.(); } catch {}

      return json({ success: true, folderName, path: path ? `${path}/${folderName}` : folderName });
    }

    if (action === "delete") {
      const accountIdParam = (body as { account_id?: string }).account_id || url.searchParams.get("account_id");
      const nodeId = (body as { nodeId?: string }).nodeId || url.searchParams.get("nodeId");
      if (!accountIdParam || !nodeId) return json({ error: "Missing account_id or nodeId" }, 400);

let accountQuery = supabaseAdmin
        .from("connected_accounts")
        .select("*")
        .eq("id", accountIdParam)
        .eq("platform", "mega")
        .eq("is_connected", true);
      if (sessionUserId) accountQuery = accountQuery.eq("user_id", sessionUserId);
      const { data: account, error: fetchError } = await accountQuery.single();

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

      const file = storage.files[nodeId];
      if (!file) {
        try { storage.api?.logout?.(); } catch {}
        return json({ error: "File or folder not found" }, 404);
      }

      await file.delete(true);
      try { storage.api?.logout?.(); } catch {}
      return json({ success: true });
    }

    return json({ error: "Invalid action" }, 400);
  } catch (err) {
    console.error("mega-auth error", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
