import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import { createRequestAuthorizer, createSessionLookup } from "../_shared/auth.ts";
import { openSealed } from "../_shared/crypto.ts";
import { DEFAULT_APP_ORIGIN } from "../_shared/oauth-state.ts";
import {
  POST_COLUMNS,
  POST_STATUSES,
  accountIdList,
  connectStatusOf,
  connectTarget,
  connectUrlRequest,
  disconnectTarget,
  editPatch,
  findAccountForDisconnect,
  findConnectOutcome,
  idOf,
  insertRow,
  listAccounts,
  listQuery,
  rangeQuery,
  retryInstant,
  revokeRequest,
} from "../_shared/posts-api.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://flowpost-studio.vercel.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const APP_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || DEFAULT_APP_ORIGIN;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const authorize = createRequestAuthorizer({
  serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
  cronApiKey: null,
  anonKey: SUPABASE_ANON_KEY,
  sessionLookup: createSessionLookup(supabase),
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function tableFailure(what: string, error: unknown) {
  console.error(`posts-api ${what} failed`, error);
  return json({ error: "The posts table did not answer." }, 500);
}

function isStatus(value: unknown): value is (typeof POST_STATUSES)[number] {
  return POST_STATUSES.includes(value as (typeof POST_STATUSES)[number]);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const auth = await authorize(req);
  const userId = auth.allowed && auth.kind === "session" ? auth.userId : null;
  if (!userId) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return json({ error: "Invalid request" }, 400);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request" }, 400);
  }

  switch (body.action) {
    case "insert": {
      const row = insertRow(userId, body.row);
      if (!row.ok) return json({ error: row.error }, row.status);
      const { data, error } = await supabase
        .from("posts")
        .insert(row.value)
        .select("id");
      if (error) return tableFailure("insert", error);
      return json({ rows: data ?? [] });
    }

    case "read": {
      const id = idOf(body);
      if (!id.ok) return json({ error: id.error }, id.status);
      const { data, error } = await supabase
        .from("posts")
        .select("id,platform,status,published_at")
        .eq("id", id.value)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) return tableFailure("read", error);
      return json({ rows: data ? [data] : [] });
    }

    case "list": {
      const query = listQuery(body);
      if (!query.ok) return json({ error: query.error }, query.status);
      const { status, platform, offset, limit } = query.value;
      let select = supabase
        .from("posts")
        .select(POST_COLUMNS)
        .eq("user_id", userId);
      if (status) select = select.eq("status", status);
      if (platform) select = select.eq("platform", platform);
      const { data, error } = await select
        .order("scheduled_at", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true })
        .range(offset, offset + limit - 1);
      if (error) return tableFailure("list", error);
      return json({ rows: data ?? [] });
    }

    case "range": {
      const range = rangeQuery(body);
      if (!range.ok) return json({ error: range.error }, range.status);
      const { data, error } = await supabase
        .from("posts")
        .select(POST_COLUMNS)
        .eq("user_id", userId)
        .gte("scheduled_at", range.value.from)
        .lt("scheduled_at", range.value.to)
        .order("scheduled_at", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });
      if (error) return tableFailure("range", error);
      return json({ rows: data ?? [] });
    }

    case "accounts": {
      const ids = accountIdList(body);
      if (!ids.ok) return json({ error: ids.error }, ids.status);
      const { data, error } = await supabase
        .from("connected_accounts")
        .select("account_id,account_name,display_name")
        .eq("user_id", userId)
        .in("account_id", ids.value);
      if (error) return tableFailure("accounts", error);
      return json({ rows: data ?? [] });
    }

    case "account-list": {
      const { data, error } = await listAccounts(supabase, userId);
      if (error) return tableFailure("account-list", error);
      return json({ rows: data ?? [] });
    }

    case "connect-url": {
      const target = connectTarget(body);
      if (!target.ok) return json({ error: target.error }, target.status);
      const request = connectUrlRequest(SUPABASE_URL, {
        platform: target.value.platform,
        nonce: target.value.nonce,
        userId,
        appOrigin: APP_ORIGIN,
      });
      if (!request) return json({ error: "The platform is not known" }, 400);
      // The auth function mints the state row and its own redirect; the
      // service key is the internal caller, so a desktop cannot ask for a
      // connect belonging to someone else.
      const res = await fetch(request.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          apikey: SUPABASE_SERVICE_ROLE_KEY,
        },
        body: JSON.stringify(request.body),
        signal: AbortSignal.timeout(15_000),
      }).catch(() => null);
      if (!res) return json({ error: "The connect did not answer." }, 502);
      const payload = (await res.json().catch(() => null)) as { url?: string } | null;
      if (!res.ok || !payload?.url) {
        console.error("connect-url upstream failed", res?.status, payload);
        return json({ error: "The connect could not start." }, 502);
      }
      // The desktop opens this in the system browser; the state it names is
      // already stored with the caller's nonce as its return link. It travels in
      // `rows` like every other answer here, because the desktop reads one shape.
      return json({ rows: [{ url: payload.url, platform: target.value.platform }] });
    }

    case "connect-status": {
      // The desktop asks this while it waits, so a browser that never hands the
      // link over — closed tab, blocked jump, failed OS handoff — still ends the
      // connect on the outcome the callback recorded.
      const target = connectTarget(body);
      if (!target.ok) return json({ error: target.error }, target.status);
      const { data, error } = await findConnectOutcome(supabase, {
        userId,
        platform: target.value.platform,
        nonce: target.value.nonce,
        appOrigin: APP_ORIGIN,
      });
      if (error) {
        console.error("connect-status read failed", error);
        return json({ error: "The connect status did not answer." }, 502);
      }
      return json({ rows: [{ result: connectStatusOf(data) }] });
    }

    case "disconnect": {
      const target = disconnectTarget(body);
      if (!target.ok) return json({ error: target.error }, target.status);
      const { data: account, error: findError } = await findAccountForDisconnect(
        supabase,
        userId,
        target.value.platform,
        target.value.accountId,
      );
      if (findError) return tableFailure("disconnect", findError);
      if (!account) return json({ error: "No such connected account" }, 404);

      // Best effort at the provider first: a token we cannot open, or a
      // provider that is down, must not leave the row behind. A token that
      // will not open decrypts to null and the revoke is skipped for it.
      const open = async (value: string | null) => (value ? await openSealed(value) : null);
      const secrets = {
        access_token: await open(account.access_token),
        refresh_token: await open(account.refresh_token),
        metadata: account.metadata
          ? {
              ...account.metadata,
              ...(typeof account.metadata.refresh_token === "string"
                ? { refresh_token: await openSealed(account.metadata.refresh_token) }
                : {}),
            }
          : null,
      };
      const revoke = revokeRequest(target.value.platform, secrets, {
        tiktokClientKey: Deno.env.get("TIKTOK_CLIENT_KEY"),
      });
      if (revoke) {
        await fetch(revoke.url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: revoke.body.toString(),
          signal: AbortSignal.timeout(10_000),
        }).catch((err) => console.error("provider revoke failed", err));
      }

      const { data: removed, error: deleteError } = await supabase
        .from("connected_accounts")
        .delete()
        .eq("user_id", userId)
        .eq("platform", target.value.platform)
        .eq("account_id", target.value.accountId)
        .select("id");
      if (deleteError) return tableFailure("disconnect", deleteError);
      // The desktop refreshes its list from the server, so the answer is
      // simply which rows went; no token material is ever copied out.
      return json({ rows: removed ?? [] });
    }

    case "update": {
      const id = idOf(body);
      if (!id.ok) return json({ error: id.error }, id.status);
      const patch = editPatch(body.patch);
      if (!patch.ok) return json({ error: patch.error }, patch.status);
      // The status filter makes the edit a compare-and-set: a row that moved
      // on while the form was open is left alone.
      const { data, error } = await supabase
        .from("posts")
        .update(patch.value)
        .eq("id", id.value)
        .eq("user_id", userId)
        .eq("status", "scheduled")
        .select("id");
      if (error) return tableFailure("update", error);
      return json({ rows: data ?? [] });
    }

    case "delete": {
      const id = idOf(body);
      if (!id.ok) return json({ error: id.error }, id.status);
      if (body.onlyIf !== undefined && !isStatus(body.onlyIf)) {
        return json({ error: "The status is not known" }, 400);
      }
      let remove = supabase
        .from("posts")
        .delete()
        .eq("id", id.value)
        .eq("user_id", userId);
      if (body.onlyIf !== undefined) remove = remove.eq("status", body.onlyIf);
      const { data, error } = await remove.select("id");
      if (error) return tableFailure("delete", error);
      return json({ rows: data ?? [] });
    }

    case "retry": {
      const id = idOf(body);
      if (!id.ok) return json({ error: id.error }, id.status);
      const instant = retryInstant(body);
      if (!instant.ok) return json({ error: instant.error }, instant.status);
      // Only a row that is still failed moves back into the queue, so a retry
      // never fires twice. Clearing the claim lets the next attempt publish.
      const { data, error } = await supabase
        .from("posts")
        .update({ status: "scheduled", scheduled_at: instant.value, claimed_at: null })
        .eq("id", id.value)
        .eq("user_id", userId)
        .eq("status", "failed")
        .select("id");
      if (error) return tableFailure("retry", error);
      return json({ rows: data ?? [] });
    }

    default:
      return json({ error: "Unknown action" }, 400);
  }
});
