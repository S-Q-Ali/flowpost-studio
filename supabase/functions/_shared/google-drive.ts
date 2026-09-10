export interface DriveTokenContext {
  supabase: any;
  decrypt: (ciphertext: string) => Promise<string>;
  fetch: (
    url: string,
    init: { headers: Record<string, string> },
  ) => Promise<{ ok: boolean }>;
  now: () => Date;
  supabaseUrl: string;
  serviceRoleKey: string | null;
}

export function shouldRefreshToken(
  expiresAt: string | null | undefined,
  now: Date,
): boolean {
  if (!expiresAt) return false;
  const expiry = new Date(expiresAt).getTime();
  if (Number.isNaN(expiry)) return false;
  return expiry - now.getTime() < 5 * 60 * 1000;
}

export function buildRefreshUrl(
  supabaseUrl: string,
  userId: string,
  driveAccountId?: string | null,
): string {
  return `${supabaseUrl}/functions/v1/google-drive-auth?action=refresh&user_id=${userId}${driveAccountId ? `&account_id=${driveAccountId}` : ""}`;
}

export async function getDriveToken(
  userId: string,
  driveAccountId: string | null | undefined,
  ctx: DriveTokenContext,
): Promise<string | null> {
  const { supabase, decrypt, fetch, now, supabaseUrl, serviceRoleKey } = ctx;

  let query = supabase
    .from("connected_accounts")
    .select("*")
    .eq("user_id", userId)
    .eq("platform", "google_drive")
    .eq("is_connected", true);

  if (driveAccountId) query = query.eq("id", driveAccountId);

  const { data: driveAccount, error: daError } = await query.maybeSingle();
  if (daError || !driveAccount) return null;
  if (!driveAccount.access_token) return null;

  if (shouldRefreshToken(driveAccount.token_expiry, now())) {
    const rawRefresh = await decrypt(driveAccount.refresh_token as string);
    if (rawRefresh) {
      try {
        const refreshUrl = buildRefreshUrl(supabaseUrl, userId, driveAccountId);
        const refreshRes = await fetch(refreshUrl, {
          headers: { Authorization: `Bearer ${serviceRoleKey}` },
        });
        if (refreshRes.ok) {
          let refreshQuery = supabase
            .from("connected_accounts")
            .select("access_token")
            .eq("user_id", userId)
            .eq("platform", "google_drive");
          if (driveAccountId) refreshQuery = refreshQuery.eq("id", driveAccountId);
          const { data: refreshed } = await refreshQuery.single();
          if (refreshed?.access_token) {
            return await decrypt(refreshed.access_token as string);
          }
        }
      } catch {
        // fall through to the existing token on refresh failure
      }
    }
  }

  return await decrypt(driveAccount.access_token as string);
}