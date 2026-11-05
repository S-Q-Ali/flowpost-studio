/**
 * What the `posts-api` function accepts, and what it refuses.
 *
 * Every check here runs before a service-role client touches the table, so a
 * malformed call never reaches the database and a call cannot name its own
 * owner.
 */

import {
  CONNECT_PLATFORMS,
  CONNECT_RESULTS,
  type ConnectResult,
  desktopReturnTo,
  normalizeReturnTo,
} from "./oauth-state.ts";

export const POST_STATUSES = [
  "scheduled",
  "processing",
  "publishing",
  "published",
  "failed",
] as const;

/** The fields a read may ask for; the token fields are never named. */
export const POST_COLUMNS =
  "id,platform,account_id,post_type,caption,hashtags,scheduled_at," +
  "published_at,status,contains_altered_content," +
  "videos(title,thumbnail_url)";

const INSERT_FIELDS = [
  "id",
  "video_id",
  "platform",
  "account_id",
  "post_type",
  "caption",
  "hashtags",
  "scheduled_at",
  "status",
  "captions_enabled",
  "contains_altered_content",
  "metadata",
] as const;

/** The only fields an edit of a scheduled row may change. */
const EDIT_FIELDS = [
  "caption",
  "hashtags",
  "contains_altered_content",
  "scheduled_at",
] as const;

/**
 * What `account-list` returns: the fields a screen shows about an account.
 * `token_expiry` tells the caller a refresh is due; the tokens themselves
 * never leave the table.
 */
export const ACCOUNT_COLUMNS =
  "id,platform,account_id,account_name,display_name,is_connected," +
  "connected_at,token_expiry";

/**
 * What a disconnect reads: the ciphertext `revokeRequest` needs, held by a
 * service-role call and never copied into a response. A separate list keeps
 * `account-list` free of token material.
 */
export const DISCONNECT_COLUMNS =
  "platform,account_id,access_token,refresh_token,metadata";

export interface AccountSecrets {
  access_token: string | null;
  refresh_token: string | null;
  metadata: Record<string, unknown> | null;
}

/** The caller's own row, with its encrypted tokens, for a disconnect. */
export function findAccountForDisconnect(
  supabase: any,
  userId: string,
  platform: string,
  accountId: string,
): PromiseLike<{ data: AccountSecrets | null; error: unknown }> {
  return supabase
    .from("connected_accounts")
    .select(DISCONNECT_COLUMNS)
    .eq("user_id", userId)
    .eq("platform", platform)
    .eq("account_id", accountId)
    .maybeSingle()
    .then(
      ({ data, error }: { data: AccountSecrets | null; error: unknown }) => ({
        data: error ? null : data,
        error,
      }),
    );
}

export const AUTH_FUNCTION_FOR_PLATFORM: Record<string, string> = {
  youtube: "youtube-auth",
  instagram: "instagram-auth",
  facebook: "facebook-auth",
  tiktok: "tiktok-auth",
  linkedin: "linkedin-auth",
  google_drive: "google-drive-auth",
};

const REVOKE_URLS = {
  google: "https://oauth2.googleapis.com/revoke",
  tiktok: "https://api.tiktok.com/v2/oauth/revokes/",
} as const;

/**
 * The provider call that revokes a stored token, or null when there is
 * nothing to revoke. Best-effort by contract: the row delete stands alone.
 * TikTok's refresh token lives encrypted in `metadata`; the Google column is
 * the access token, which `https://oauth2.googleapis.com/revoke` accepts.
 * Facebook and LinkedIn have no single-token revoke endpoint, so their
 * disconnect is the row delete alone.
 */
export function revokeRequest(
  platform: string,
  secrets: AccountSecrets,
  options: { tiktokClientKey?: string | null } = {},
): { url: string; body: URLSearchParams } | null {
  if (platform === "youtube" || platform === "google_drive") {
    return secrets.access_token
      ? { url: REVOKE_URLS.google, body: new URLSearchParams({ token: secrets.access_token }) }
      : null;
  }
  if (platform === "tiktok") {
    const stored = secrets.metadata?.refresh_token ?? secrets.refresh_token;
    if (typeof stored !== "string" || !stored || !options.tiktokClientKey) return null;
    return {
      url: REVOKE_URLS.tiktok,
      body: new URLSearchParams({ client_key: options.tiktokClientKey, refresh_token: stored }),
    };
  }
  return null;
}

/** The platform + the desktop nonce a connect names; never an owner. */
export function connectTarget(
  input: unknown,
): Checked<{ platform: string; nonce: string }> {
  const source = sourceOf(input);
  if (!source) return refuse(400, "A connect is required");
  const platform = source.platform;
  if (typeof platform !== "string" || !AUTH_FUNCTION_FOR_PLATFORM[platform]) {
    return refuse(400, "The platform is not known");
  }
  const nonce = source.nonce;
  if (typeof nonce !== "string" || !/^[0-9a-f]{64}$/.test(nonce)) {
    return refuse(400, "A connect nonce is required");
  }
  return { ok: true, value: { platform, nonce } };
}

/** The platform + account id a disconnect names; never an owner. */
export function disconnectTarget(
  input: unknown,
): Checked<{ platform: string; accountId: string }> {
  const source = sourceOf(input);
  if (!source) return refuse(400, "A disconnect is required");
  const platform = source.platform;
  if (typeof platform !== "string" || !CONNECT_PLATFORMS.has(platform)) {
    return refuse(400, "The platform is not known");
  }
  const accountId = source.accountId;
  if (typeof accountId !== "string" || !accountId.trim()) {
    return refuse(400, "An account id is required");
  }
  return { ok: true, value: { platform, accountId: accountId.trim() } };
}

/**
 * The auth-function URL for a browser connect, or null when the platform or
 * the desktop link is not usable. The link carries the caller's own nonce and
 * is re-checked against the allowlist before it is ever put in a query.
 */
export function connectUrlRequest(
  supabaseUrl: string,
  input: { platform: string; nonce: string; userId: string; appOrigin: string },
): { url: string; body: Record<string, unknown> } | null {
  const functionName = AUTH_FUNCTION_FOR_PLATFORM[input.platform];
  if (!functionName) return null;
  const link = desktopReturnTo(input.platform, input.nonce);
  if (normalizeReturnTo(link, input.appOrigin, input.platform) === null) return null;
  const url = new URL(`${supabaseUrl}/functions/v1/${functionName}`);
  url.searchParams.set("action", "url");
  url.searchParams.set("userId", input.userId);
  url.searchParams.set("return_to", link);
  return {
    url: url.toString(),
    body: { action: "url", userId: input.userId, return_to: link },
  };
}

/**
 * The outcome a browser callback recorded for the connect this caller is
 * waiting on.
 *
 * The desktop reads this when no flowpost:// link reaches it: the tab was
 * closed, the browser blocked the automatic jump, or the OS handoff never
 * landed. The link the row was stored under is rebuilt here from the platform
 * and the caller's own nonce, and the owner comes from the session, so one
 * desktop can only ever read its own wait.
 */
export function findConnectOutcome(
  supabase: any,
  input: { userId: string; platform: string; nonce: string; appOrigin: string },
): PromiseLike<{ data: { result: string | null } | null; error: unknown }> {
  const trusted = normalizeReturnTo(
    desktopReturnTo(input.platform, input.nonce),
    input.appOrigin,
    input.platform,
  );
  if (!trusted) return Promise.resolve({ data: null, error: null });
  return supabase
    .from("oauth_states")
    .select("result")
    .eq("user_id", input.userId)
    .eq("return_to", trusted)
    .maybeSingle();
}

/** What the desktop is told: the outcome recorded, or that nothing landed. */
export function connectStatusOf(row: { result: string | null } | null): string {
  const result = row?.result;
  return CONNECT_RESULTS.includes(result as ConnectResult) ? result as ConnectResult : "pending";
}

export interface AccountRows {
  data: Record<string, unknown>[] | null;
  error: unknown;
}

/**
 * The caller's own connected accounts, ready to await.
 *
 * The owner comes from the session and never from the body, so the read the
 * service-role client makes carries the same `user_id` filter the row-level
 * policy would apply to an anon key.
 */
export function listAccounts(
  supabase: any,
  userId: string,
): PromiseLike<AccountRows> {
  return supabase
    .from("connected_accounts")
    .select(ACCOUNT_COLUMNS)
    .eq("user_id", userId)
    .order("platform")
    .order("account_name");
}

export type Checked<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; error: string };

function refuse(status: number, error: string): { ok: false; status: number; error: string } {
  return { ok: false, status, error };
}

function sourceOf(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  return input as Record<string, unknown>;
}

function isInstant(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

/**
 * The row the table writes. The owner is the session, whatever the client
 * sent; unknown columns are dropped rather than trusted.
 */
export function insertRow(
  userId: string,
  input: unknown,
): Checked<Record<string, unknown>> {
  const source = sourceOf(input);
  if (!source) return refuse(400, "A row is required");
  if (typeof source.id !== "string" || !source.id.trim()) {
    return refuse(400, "A row needs its id");
  }
  const row: Record<string, unknown> = {};
  for (const field of INSERT_FIELDS) {
    if (field in source) row[field] = source[field];
  }
  row.user_id = userId;
  return { ok: true, value: row };
}

/** The fields an edit may change; ownership and status are never among them. */
export function editPatch(input: unknown): Checked<Record<string, unknown>> {
  const source = sourceOf(input);
  if (!source) return refuse(400, "A patch is required");
  const patch: Record<string, unknown> = {};
  for (const field of EDIT_FIELDS) {
    if (field in source) patch[field] = source[field];
  }
  if (Object.keys(patch).length === 0) return refuse(400, "A patch needs a field");
  return { ok: true, value: patch };
}

export function idOf(input: unknown): Checked<string> {
  const id = sourceOf(input)?.id;
  if (typeof id !== "string" || !id.trim()) return refuse(400, "An id is required");
  return { ok: true, value: id };
}

export interface ListQuery {
  status?: string;
  platform?: string;
  offset: number;
  limit: number;
}

export function listQuery(input: unknown): Checked<ListQuery> {
  const source = sourceOf(input) ?? {};
  const offset = source.offset ?? 0;
  const limit = source.limit ?? 200;
  if (!Number.isInteger(offset) || (offset as number) < 0) {
    return refuse(400, "The offset is not valid");
  }
  if (!Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > 500) {
    return refuse(400, "The limit is not valid");
  }
  const status = source.status;
  if (status !== undefined && !POST_STATUSES.includes(status as (typeof POST_STATUSES)[number])) {
    return refuse(400, "The status is not known");
  }
  const platform = source.platform;
  if (platform !== undefined && (typeof platform !== "string" || !platform)) {
    return refuse(400, "The platform is not valid");
  }
  const query: ListQuery = { offset: offset as number, limit: limit as number };
  if (typeof status === "string") query.status = status;
  if (typeof platform === "string") query.platform = platform;
  return { ok: true, value: query };
}

export interface RangeQuery {
  from: string;
  to: string;
}

export function rangeQuery(input: unknown): Checked<RangeQuery> {
  const source = sourceOf(input) ?? {};
  if (!isInstant(source.from) || !isInstant(source.to)) {
    return refuse(400, "A range needs two instants");
  }
  if (Date.parse(source.from) >= Date.parse(source.to)) {
    return refuse(400, "The range is empty");
  }
  return { ok: true, value: { from: source.from, to: source.to } };
}

export function accountIdList(input: unknown): Checked<string[]> {
  const ids = sourceOf(input)?.ids;
  if (!Array.isArray(ids)) return refuse(400, "The account ids are missing");
  const unique = [
    ...new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0)),
  ];
  if (unique.length === 0) return refuse(400, "The account ids are missing");
  if (unique.length > 100) return refuse(400, "Too many accounts");
  return { ok: true, value: unique };
}

export function retryInstant(input: unknown): Checked<string> {
  const instant = sourceOf(input)?.scheduledAt;
  if (!isInstant(instant)) return refuse(400, "A scheduled time is required");
  return { ok: true, value: instant };
}
