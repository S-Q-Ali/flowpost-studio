export interface OAuthStateValue {
  state: string;
  expiresAt: string;
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function newOAuthStateValue(): OAuthStateValue {
  const state = randomHex(24);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  return { state, expiresAt };
}

export async function createOAuthState(
  supabase: any,
  args: { userId: string; mode?: string },
): Promise<string> {
  const { state, expiresAt } = newOAuthStateValue();
  const { error } = await supabase.from("oauth_states").insert({
    user_id: args.userId,
    state,
    mode: args.mode ?? null,
    expires_at: expiresAt,
    used_at: null,
  });
  if (error) throw error;
  return state;
}

export async function consumeOAuthState(
  supabase: any,
  state: string,
): Promise<{ userId: string; mode?: string | null } | null> {
  if (!state) return null;
  const { data, error } = await supabase
    .from("oauth_states")
    .update({ used_at: new Date().toISOString() })
    .eq("state", state)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("user_id, mode")
    .maybeSingle();
  if (error || !data) return null;
  return { userId: data.user_id, mode: data.mode };
}