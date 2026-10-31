export const SESSION_TTL_DAYS = 7;

export interface NewSession {
  token: string;
  expiresAt: string;
}

/**
 * Replaces that user's sessions with a fresh one.
 *
 * One live session per user is the contract the desktop and the web gate
 * share: a new token invalidates the user's others, and the client that lost
 * it re-activates. Other users' sessions must survive.
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

  await supabase.from("sessions").delete().eq("user_id", userId);

  const { error } = await supabase
    .from("sessions")
    .insert({ token, expires_at: expiresAt, user_id: userId });

  if (error) throw new Error("Session creation failed");

  return { token, expiresAt };
}
