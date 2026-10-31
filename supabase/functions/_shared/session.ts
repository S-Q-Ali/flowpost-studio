export const SESSION_TTL_DAYS = 7;

/** The sentinel row the delete skips, so an empty table is not an error case. */
export const EMPTY_SESSION_ID = "00000000-0000-0000-0000-000000000000";

export interface NewSession {
  token: string;
  expiresAt: string;
}

/**
 * Replaces every session with a fresh one for `userId`.
 *
 * One live session is the contract the desktop and the web gate already share:
 * a new token invalidates the others, and the client that lost it re-activates.
 */
export async function createSession(
  supabase: any,
  userId: string,
  now: Date = new Date(),
): Promise<NewSession> {
  const token = crypto.randomUUID() + crypto.randomUUID();
  const expiresAt = new Date(
    now.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  await supabase.from("sessions").delete().neq("id", EMPTY_SESSION_ID);

  const { error } = await supabase
    .from("sessions")
    .insert({ token, expires_at: expiresAt, user_id: userId });

  if (error) throw new Error("Session creation failed");

  return { token, expiresAt };
}
