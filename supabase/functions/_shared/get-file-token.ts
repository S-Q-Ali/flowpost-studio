import { encrypt } from "./crypto.ts";

/** Where a video or image physically lives, for the get-file proxy to fetch. */
export interface FileSource {
  megaFileName?: string;
  megaAccountId?: string;
  megaUrl?: string;
  driveUrl?: string;
  driveToken?: string;
  driveAccountId?: string;
}

/**
 * A get-file proxy URL for one user's own media.
 *
 * get-file is a public endpoint, so the token it reads is a credential: every
 * mint carries the owner, and the proxy only ever serves that owner's rows.
 */
export async function fileProxyUrl(
  source: FileSource,
  userId: string,
  now: Date = new Date(),
): Promise<string> {
  const token = await encrypt(
    JSON.stringify({ ...source, userId, exp: now.getTime() + 15 * 60 * 1000 }),
  );
  return `${Deno.env.get("SUPABASE_URL")}/functions/v1/get-file?token=${encodeURIComponent(token)}`;
}
