/**
 * What the `posts-api` function accepts, and what it refuses.
 *
 * Every check here runs before a service-role client touches the table, so a
 * malformed call never reaches the database and a call cannot name its own
 * owner.
 */

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
