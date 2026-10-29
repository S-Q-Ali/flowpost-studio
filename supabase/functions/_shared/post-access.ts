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
