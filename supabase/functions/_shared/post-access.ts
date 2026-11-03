import { resolveSessionOwner, type AuthResult } from "./auth.ts";

export interface PublishableRow {
  user_id?: string | null;
  status?: string | null;
}

export type PostAccess =
  | { ok: true }
  | { ok: false; status: number; error: string };

/**
 * Decides whether the caller may publish the row.
 *
 * A session only reaches its own row, and a published row is never published
 * again — the scheduler can retry a call whose first run already reached the
 * platform.
 */
export function checkPostAccess(
  auth: AuthResult,
  post: PublishableRow,
): PostAccess {
  if (resolveSessionOwner(auth, post.user_id ?? null).denied) {
    return { ok: false, status: 403, error: "Post belongs to another user" };
  }
  if (post.status === "published") {
    return { ok: false, status: 409, error: "Post is already published" };
  }
  return { ok: true };
}

const LIVE_STATUSES = ["scheduled", "processing", "publishing"];

/** A publish attempt's lock: the row it holds and the moment it stamped it. */
export type PostClaim = { postId: string; claimedAt: string };

/** The claim, carried alongside `ok`, for a caller that holds the post. */
export type HeldClaim = { ok: true } & PostClaim;

export type ClaimResult = HeldClaim | { ok: false; status: number; error: string };

/**
 * Marks a post as being published by this call.
 *
 * The conditional update is the lock: two callers that read the same row can
 * both reach the platform, so whoever stamps `claimed_at` first wins and the
 * other gets a 409. The stamp is returned so the holder can fence every write
 * it makes afterwards — see `settlePost`.
 */
export async function claimPost(
  supabase: any,
  postId: string,
  now: Date = new Date(),
): Promise<ClaimResult> {
  const claimedAt = now.toISOString();
  const { data, error } = await supabase
    .from("posts")
    .update({ claimed_at: claimedAt })
    .eq("id", postId)
    .is("claimed_at", null)
    .in("status", LIVE_STATUSES)
    .select("id");
  if (error) return { ok: false, status: 500, error: "Could not claim the post" };
  if (!data || data.length === 0) {
    return { ok: false, status: 409, error: "Post is already being published" };
  }
  return { ok: true, postId, claimedAt };
}

/**
 * Writes a post the caller claimed, and only while that claim is still its own.
 *
 * A half-hour cut-off releases the claim and the scheduler hands the row to a
 * second attempt; without the fence the first attempt's late answer would then
 * overwrite the second one's status. Returns whether the row was written, so a
 * caller that lost the post knows not to report it.
 */
export async function settlePost(
  supabase: any,
  claim: PostClaim,
  patch: Record<string, unknown>,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("posts")
    .update(patch)
    .eq("id", claim.postId)
    .eq("claimed_at", claim.claimedAt)
    .select("id");
  return !error && Array.isArray(data) && data.length > 0;
}
