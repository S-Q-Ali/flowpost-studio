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

/**
 * Marks a post as being published by this call.
 *
 * The conditional update is the lock: two callers that read the same row can
 * both reach the platform, so whoever stamps `claimed_at` first wins and the
 * other gets a 409. A finished attempt leaves the stamp in place; the retry
 * action clears it.
 */
export async function claimPost(
  supabase: any,
  postId: string,
  now: Date = new Date(),
): Promise<PostAccess> {
  const { data, error } = await supabase
    .from("posts")
    .update({ claimed_at: now.toISOString() })
    .eq("id", postId)
    .is("claimed_at", null)
    .in("status", LIVE_STATUSES)
    .select("id");
  if (error) return { ok: false, status: 500, error: "Could not claim the post" };
  if (!data || data.length === 0) {
    return { ok: false, status: 409, error: "Post is already being published" };
  }
  return { ok: true };
}
