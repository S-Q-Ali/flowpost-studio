import { describe, it, expect, vi } from "vitest";
import {
  ACCOUNT_COLUMNS,
  POST_COLUMNS,
  accountIdList,
  connectStatusOf,
  connectTarget,
  connectUrlRequest,
  disconnectTarget,
  DISCONNECT_COLUMNS,
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
} from "./posts-api";

describe("insertRow", () => {
  it("writes the row under the session user, not the one the client sent", () => {
    const result = insertRow("user-1", {
      id: "5c1f0a3e-7f5b-4a0e-9a4e-2f7c1d8b0a11",
      user_id: "user-2",
      platform: "instagram",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        id: "5c1f0a3e-7f5b-4a0e-9a4e-2f7c1d8b0a11",
        platform: "instagram",
        user_id: "user-1",
      },
    });
  });

  it("drops a field the table does not take", () => {
    const result = insertRow("user-1", {
      id: "post-1",
      published_at: "2026-10-29T09:00:00Z",
      created_at: "2026-10-29T08:00:00Z",
    });

    expect(result).toEqual({ ok: true, value: { id: "post-1", user_id: "user-1" } });
  });

  it("keeps the fields the desktop writes", () => {
    const result = insertRow("user-1", {
      id: "post-1",
      video_id: "video-1",
      platform: "instagram",
      account_id: "ig-1",
      post_type: "feed",
      caption: "Hello",
      hashtags: "#hi",
      scheduled_at: "2026-10-29T12:00:00Z",
      status: "processing",
      captions_enabled: true,
      contains_altered_content: false,
      metadata: { title: "Hi" },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.scheduled_at).toBe("2026-10-29T12:00:00Z");
      expect(result.value.metadata).toEqual({ title: "Hi" });
      expect(result.value.status).toBe("processing");
    }
  });

  it("refuses a row without an id", () => {
    expect(insertRow("user-1", { platform: "instagram" })).toEqual({
      ok: false,
      status: 400,
      error: "A row needs its id",
    });
  });

  it("refuses a body that is not an object", () => {
    expect(insertRow("user-1", "nope")).toEqual({
      ok: false,
      status: 400,
      error: "A row is required",
    });
    expect(insertRow("user-1", null)).toMatchObject({ ok: false, status: 400 });
  });
});

describe("editPatch", () => {
  it("keeps only the fields an edit may change", () => {
    const result = editPatch({
      caption: "New",
      hashtags: "#new",
      contains_altered_content: true,
      scheduled_at: "2026-10-30T09:00:00Z",
      status: "published",
      user_id: "user-2",
      id: "other",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        caption: "New",
        hashtags: "#new",
        contains_altered_content: true,
        scheduled_at: "2026-10-30T09:00:00Z",
      },
    });
  });

  it("refuses a patch that changes nothing it is allowed to change", () => {
    expect(editPatch({ status: "published" })).toEqual({
      ok: false,
      status: 400,
      error: "A patch needs a field",
    });
  });
});

describe("idOf", () => {
  it("reads the id", () => {
    expect(idOf({ id: "post-1" })).toEqual({ ok: true, value: "post-1" });
  });

  it("refuses a missing or blank id", () => {
    expect(idOf({})).toMatchObject({ ok: false, status: 400 });
    expect(idOf({ id: "   " })).toMatchObject({ ok: false, status: 400 });
    expect(idOf({ id: 7 })).toMatchObject({ ok: false, status: 400 });
  });
});

describe("listQuery", () => {
  it("defaults to the first page", () => {
    expect(listQuery({})).toEqual({
      ok: true,
      value: { offset: 0, limit: 200 },
    });
  });

  it("keeps a known status and platform", () => {
    expect(listQuery({ status: "scheduled", platform: "instagram" })).toEqual({
      ok: true,
      value: { offset: 0, limit: 200, status: "scheduled", platform: "instagram" },
    });
  });

  it("refuses a status the table does not hold", () => {
    expect(listQuery({ status: "cancelled" })).toMatchObject({ ok: false, status: 400 });
  });

  it("refuses a limit above the page bound", () => {
    expect(listQuery({ limit: 501 })).toMatchObject({ ok: false, status: 400 });
    expect(listQuery({ limit: 0 })).toMatchObject({ ok: false, status: 400 });
    expect(listQuery({ limit: 1.5 })).toMatchObject({ ok: false, status: 400 });
  });

  it("refuses a negative offset", () => {
    expect(listQuery({ offset: -1 })).toMatchObject({ ok: false, status: 400 });
  });

  it("refuses a platform that is not a name", () => {
    expect(listQuery({ platform: "" })).toMatchObject({ ok: false, status: 400 });
    expect(listQuery({ platform: 3 })).toMatchObject({ ok: false, status: 400 });
  });
});

describe("rangeQuery", () => {
  it("keeps two instants in order", () => {
    expect(
      rangeQuery({ from: "2026-10-01T00:00:00Z", to: "2026-11-01T00:00:00Z" }),
    ).toEqual({
      ok: true,
      value: { from: "2026-10-01T00:00:00Z", to: "2026-11-01T00:00:00Z" },
    });
  });

  it("refuses a missing, malformed or empty range", () => {
    expect(rangeQuery({})).toMatchObject({ ok: false, status: 400 });
    expect(rangeQuery({ from: "soon", to: "later" })).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(
      rangeQuery({ from: "2026-11-01T00:00:00Z", to: "2026-10-01T00:00:00Z" }),
    ).toMatchObject({ ok: false, status: 400 });
  });
});

describe("accountIdList", () => {
  it("keeps the names once, without blanks", () => {
    expect(accountIdList({ ids: ["ig-1", "ig-1", "", 7, "yt-1"] })).toEqual({
      ok: true,
      value: ["ig-1", "yt-1"],
    });
  });

  it("refuses a body that names no account", () => {
    expect(accountIdList({})).toMatchObject({ ok: false, status: 400 });
    expect(accountIdList({ ids: [] })).toMatchObject({ ok: false, status: 400 });
    expect(accountIdList({ ids: "ig-1" })).toMatchObject({ ok: false, status: 400 });
  });

  it("refuses more accounts than one page holds", () => {
    const ids = Array.from({ length: 101 }, (_, index) => `account-${index}`);
    expect(accountIdList({ ids })).toMatchObject({ ok: false, status: 400 });
  });
});

/**
 * A `connected_accounts` table that answers the way PostgREST does: every
 * filter narrows the rows, and the awaited builder returns `{ data, error }`.
 */
function fakeAccounts(rows: Record<string, unknown>[], error: unknown = null) {
  const calls: string[] = [];
  const selects: string[] = [];
  let kept = rows;
  const chain: Record<string, any> = {};
  chain.select = vi.fn((columns: string) => {
    calls.push("select");
    selects.push(columns);
    return chain;
  });
  chain.eq = vi.fn((column: string, value: unknown) => {
    calls.push(`eq:${column}=${String(value)}`);
    kept = kept.filter((row) => row[column] === value);
    return chain;
  });
  chain.order = vi.fn((column: string) => {
    calls.push(`order:${column}`);
    return chain;
  });
  chain.then = (
    resolve: (value: { data: Record<string, unknown>[]; error: unknown }) => void,
  ) => resolve({ data: kept, error });
  const supabase = {
    from: vi.fn((table: string) => {
      calls.push(`from:${table}`);
      return chain;
    }),
  };
  return { supabase, calls, selects };
}

describe("listAccounts", () => {
  it("reads only the rows that belong to the caller", async () => {
    const { supabase } = fakeAccounts([
      { user_id: "user-1", account_id: "yt-1" },
      { user_id: "user-2", account_id: "ig-1" },
    ]);

    const { data } = await listAccounts(supabase, "user-1");

    expect(data).toEqual([{ user_id: "user-1", account_id: "yt-1" }]);
  });

  it("takes the owner from the session, not from the body", async () => {
    const { supabase, calls } = fakeAccounts([]);

    await listAccounts(supabase, "user-1");

    expect(calls).toEqual([
      "from:connected_accounts",
      "select",
      "eq:user_id=user-1",
      "order:platform",
      "order:account_name",
    ]);
  });

  it("asks for the display fields and never a token", async () => {
    const { supabase, selects } = fakeAccounts([]);

    await listAccounts(supabase, "user-1");

    expect(selects).toEqual([ACCOUNT_COLUMNS]);
    for (const field of [
      "platform",
      "account_id",
      "account_name",
      "display_name",
      "is_connected",
      "token_expiry",
    ]) {
      expect(ACCOUNT_COLUMNS).toContain(field);
    }
    expect(ACCOUNT_COLUMNS).not.toMatch(/access_token|refresh_token/);
  });

  it("hands a table failure back to the handler", async () => {
    const { supabase } = fakeAccounts([], { message: "db down" });

    const { data, error } = await listAccounts(supabase, "user-1");

    expect(error).toEqual({ message: "db down" });
    expect(data).toEqual([]);
  });

  it("drops the deadline the server renews past on the next use", async () => {
    const { supabase } = fakeAccounts(
      ["google_drive", "youtube", "tiktok"].map((platform) => ({
        user_id: "user-1",
        platform,
        account_id: `${platform}-1`,
        is_connected: true,
        token_expiry: "2026-11-05T13:05:00Z",
      })),
    );

    const { data } = await listAccounts(supabase, "user-1");

    expect(data?.map((row) => row.token_expiry)).toEqual([null, null, null]);
  });

  it("keeps the deadline of a token nothing renews", async () => {
    const { supabase } = fakeAccounts([
      {
        user_id: "user-1",
        platform: "instagram",
        account_id: "ig-1",
        is_connected: true,
        token_expiry: "2026-11-05T13:05:00Z",
      },
    ]);

    const { data } = await listAccounts(supabase, "user-1");

    expect(data?.[0].token_expiry).toBe("2026-11-05T13:05:00Z");
  });
});

describe("retryInstant", () => {
  it("reads an instant", () => {
    expect(retryInstant({ scheduledAt: "2026-10-29T12:00:00Z" })).toEqual({
      ok: true,
      value: "2026-10-29T12:00:00Z",
    });
  });

  it("refuses a missing or malformed instant", () => {
    expect(retryInstant({})).toMatchObject({ ok: false, status: 400 });
    expect(retryInstant({ scheduledAt: "tomorrow" })).toMatchObject({
      ok: false,
      status: 400,
    });
  });
});

describe("POST_COLUMNS", () => {
  it("never names a token field", () => {
    expect(POST_COLUMNS).not.toMatch(/token/i);
  });
});

/**
 * One `connected_accounts` row, read the way PostgREST answers a single row:
 * every filter narrows it, and the awaited builder gives `{ data, error }`.
 */
function fakeAccountRow(rows: Record<string, unknown>[], error: unknown = null) {
  const calls: string[] = [];
  const selects: string[] = [];
  let kept = rows;
  const chain: Record<string, any> = {};
  chain.select = (columns: string) => {
    calls.push("select");
    selects.push(columns);
    return chain;
  };
  chain.eq = (column: string, value: unknown) => {
    calls.push(`eq:${column}=${String(value)}`);
    kept = kept.filter((row) => row[column] === value);
    return chain;
  };
  chain.maybeSingle = () =>
    Promise.resolve({ data: kept.length === 1 ? kept[0] : null, error });
  const supabase = {
    from: (table: string) => {
      calls.push(`from:${table}`);
      return chain;
    },
  };
  return { supabase, calls, selects };
}

describe("findAccountForDisconnect", () => {
  const row = {
    platform: "youtube",
    account_id: "ch-1",
    user_id: "user-1",
    access_token: "cipher",
    refresh_token: null,
    metadata: {},
  };

  it("reads one row only under the caller's own filter", async () => {
    const { supabase, calls, selects } = fakeAccountRow([row]);

    const { data, error } = await findAccountForDisconnect(
      supabase,
      "user-1",
      "youtube",
      "ch-1",
    );

    expect(error).toBeNull();
    expect(data).toEqual(row);
    expect(selects).toEqual([DISCONNECT_COLUMNS]);
    expect(calls).toContain("eq:user_id=user-1");
    expect(calls).toContain("eq:platform=youtube");
    expect(calls).toContain("eq:account_id=ch-1");
  });

  it("finds nothing for a row owned by another user", async () => {
    const { supabase } = fakeAccountRow([{ ...row, user_id: "user-2" }]);

    const { data } = await findAccountForDisconnect(supabase, "user-1", "youtube", "ch-1");

    expect(data).toBeNull();
  });

  it("hands a table failure back to the handler with no row", async () => {
    const { supabase } = fakeAccountRow([row], { message: "db down" });

    const { data, error } = await findAccountForDisconnect(
      supabase,
      "user-1",
      "youtube",
      "ch-1",
    );

    expect(error).toEqual({ message: "db down" });
    expect(data).toBeNull();
  });
});

describe("connectTarget", () => {
  const nonce = "a".repeat(64);

  it("reads a platform that has an auth function and a desktop nonce", () => {
    expect(connectTarget({ platform: "youtube", nonce })).toEqual({
      ok: true,
      value: { platform: "youtube", nonce },
    });
  });

  it("refuses mega — it has no browser connect to ask for", () => {
    expect(connectTarget({ platform: "mega", nonce })).toMatchObject({ ok: false, status: 400 });
  });

  it("refuses a platform it does not know and a nonce that is not 32 bytes of hex", () => {
    expect(connectTarget({ platform: "twitter", nonce })).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(connectTarget({ platform: "youtube" })).toMatchObject({ ok: false, status: 400 });
    expect(connectTarget({ platform: "youtube", nonce: "A".repeat(64) })).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(connectTarget({ platform: "youtube", nonce: `${nonce}aa` })).toMatchObject({
      ok: false,
      status: 400,
    });
  });
});

describe("connectUrlRequest", () => {
  const nonce = "a".repeat(64);
  const base = { userId: "user-1", appOrigin: "https://flowpost-studio.vercel.app" };

  it("asks the platform's own auth function with the desktop link bound to the nonce", () => {
    const request = connectUrlRequest("https://proj.supabase.co", {
      platform: "youtube",
      nonce,
      ...base,
    });
    const url = new URL(request!.url);
    expect(url.pathname).toBe("/functions/v1/youtube-auth");
    expect(url.searchParams.get("action")).toBe("url");
    expect(url.searchParams.get("userId")).toBe("user-1");
    expect(url.searchParams.get("return_to")).toBe(
      `flowpost://connect-callback?platform=youtube&nonce=${nonce}`,
    );
  });

  it("sends the same link in the body, for the functions that read a body", () => {
    const request = connectUrlRequest("https://proj.supabase.co", {
      platform: "linkedin",
      nonce,
      ...base,
    });
    expect(request!.body.return_to).toBe(new URL(request!.url).searchParams.get("return_to"));
    expect(request!.body.action).toBe("url");
  });

  it("gives nothing for a platform without an auth function or a malformed nonce", () => {
    expect(connectUrlRequest("https://proj.supabase.co", { platform: "mega", nonce, ...base })).toBeNull();
    expect(
      connectUrlRequest("https://proj.supabase.co", { platform: "youtube", nonce: "short", ...base }),
    ).toBeNull();
  });
});

describe("findConnectOutcome", () => {
  const nonce = "a".repeat(64);
  const link = `flowpost://connect-callback?platform=youtube&nonce=${nonce}`;
  const input = {
    userId: "user-1",
    platform: "youtube",
    nonce,
    appOrigin: "https://flowpost-studio.vercel.app",
  };

  function fakeStates(row: { result: string | null } | null, error: unknown = null) {
    const calls: string[] = [];
    const selects: string[] = [];
    const chain: Record<string, any> = {};
    chain.select = vi.fn((columns: string) => {
      calls.push("select");
      selects.push(columns);
      return chain;
    });
    chain.eq = vi.fn((column: string, value: unknown) => {
      calls.push(`eq:${column}=${String(value)}`);
      return chain;
    });
    chain.maybeSingle = vi.fn(() => Promise.resolve({ data: row, error }));
    const supabase = {
      from: vi.fn((table: string) => {
        calls.push(`from:${table}`);
        return chain;
      }),
    };
    return { supabase, calls, selects };
  }

  it("reads the outcome the browser callback left on this caller's own connect", async () => {
    const { supabase, calls } = fakeStates({ result: "connected" });

    const { data } = await findConnectOutcome(supabase, input);

    expect(data).toEqual({ result: "connected" });
    expect(calls).toEqual([
      "from:oauth_states",
      "select",
      "eq:user_id=user-1",
      `eq:return_to=${link}`,
    ]);
  });

  it("asks for the outcome alone — never the state, the owner or a token", async () => {
    const { supabase, selects } = fakeStates(null);

    await findConnectOutcome(supabase, input);

    expect(selects).toEqual(["result"]);
  });

  it("hands a table failure back to the handler", async () => {
    const { supabase } = fakeStates(null, { message: "db down" });

    const { data, error } = await findConnectOutcome(supabase, input);

    expect(error).toEqual({ message: "db down" });
    expect(data).toBeNull();
  });

  it("reads nothing for a connect the desktop never could have started", async () => {
    const { supabase, calls } = fakeStates({ result: "connected" });

    const unknown = await findConnectOutcome(supabase, {
      ...input,
      platform: "twitter",
    });
    const malformed = await findConnectOutcome(supabase, {
      ...input,
      nonce: "not-64-hex",
    });

    expect(unknown.data).toBeNull();
    expect(malformed.data).toBeNull();
    expect(calls).toEqual([]);
  });
});

describe("connectStatusOf", () => {
  it("says pending until a callback records an outcome", () => {
    expect(connectStatusOf(null)).toBe("pending");
    expect(connectStatusOf({ result: null })).toBe("pending");
    expect(connectStatusOf({ result: "connected" })).toBe("connected");
    expect(connectStatusOf({ result: "denied" })).toBe("denied");
    expect(connectStatusOf({ result: "failed" })).toBe("failed");
  });

  it("will not pass on a word the connect contract does not have", () => {
    expect(connectStatusOf({ result: "<script>" })).toBe("pending");
  });
});

describe("disconnectTarget", () => {
  it("reads a platform and one account id", () => {
    expect(disconnectTarget({ platform: "youtube", accountId: "ch-1" })).toEqual({
      ok: true,
      value: { platform: "youtube", accountId: "ch-1" },
    });
  });

  it("refuses a platform it does not know", () => {
    expect(disconnectTarget({ platform: "twitter", accountId: "x" })).toMatchObject({
      ok: false,
      status: 400,
    });
  });

  it("refuses a blank account id", () => {
    expect(disconnectTarget({ platform: "youtube", accountId: "" })).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(disconnectTarget({ platform: "youtube" })).toMatchObject({ ok: false, status: 400 });
  });

  it("never takes an owner from the body", () => {
    const withOwner = disconnectTarget({
      platform: "youtube",
      accountId: "ch-1",
      user_id: "victim",
    });
    expect(withOwner.ok && withOwner.value).not.toHaveProperty("user_id");
  });
});

describe("revokeRequest", () => {
  const enc = "gcm-ciphertext";

  it("revokes the access token at Google for every Google-backed platform", () => {
    for (const platform of ["youtube", "google_drive"]) {
      const request = revokeRequest(platform, {
        access_token: enc,
        refresh_token: null,
        metadata: {},
      });
      expect(request).not.toBeNull();
      expect(request!.url).toBe("https://oauth2.googleapis.com/revoke");
      expect(request!.body.get("token")).toBe(enc);
    }
  });

  it("revokes the stored refresh token at TikTok", () => {
    const request = revokeRequest(
      "tiktok",
      { access_token: "stale-access", refresh_token: null, metadata: { refresh_token: enc } },
      { tiktokClientKey: "client-key-1" },
    );
    expect(request!.url).toBe("https://api.tiktok.com/v2/oauth/revokes/");
    expect(request!.body.get("refresh_token")).toBe(enc);
    expect(request!.body.get("client_key")).toBe("client-key-1");
  });

  it("skips the TikTok revoke when no client key is configured", () => {
    expect(
      revokeRequest("tiktok", { access_token: null, refresh_token: null, metadata: { refresh_token: enc } }, {}),
    ).toBeNull();
  });

  it("leaves facebook and linkedin to the row delete — no single-token revoke exists", () => {
    for (const platform of ["facebook", "linkedin"]) {
      expect(
        revokeRequest(platform, { access_token: enc, refresh_token: null, metadata: {} }),
      ).toBeNull();
    }
  });

  it("revokes nothing without a token to revoke", () => {
    expect(revokeRequest("youtube", { access_token: null, refresh_token: null, metadata: {} })).toBeNull();
    expect(revokeRequest("tiktok", { access_token: enc, refresh_token: null, metadata: {} })).toBeNull();
  });

  it("refuses an unknown platform rather than posting a token anywhere", () => {
    expect(
      revokeRequest("myspace", { access_token: enc, refresh_token: null, metadata: {} }),
    ).toBeNull();
  });
});

describe("ACCOUNT_COLUMNS", () => {
  it("keeps the ciphertext out of the list a screen renders", () => {
    expect(ACCOUNT_COLUMNS).not.toMatch(/access_token|refresh_token|metadata/);
  });

  it("gives the disconnect read its own column list", () => {
    expect(DISCONNECT_COLUMNS).toContain("access_token");
    expect(DISCONNECT_COLUMNS).toContain("refresh_token");
    expect(DISCONNECT_COLUMNS).not.toMatch(/account_name|display_name|password|secret/i);
  });
});
