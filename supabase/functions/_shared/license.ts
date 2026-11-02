export const MIN_LICENSE_KEY_LENGTH = 16;
export const MAX_LICENSE_KEY_LENGTH = 256;

export interface LicenseRow {
  active?: boolean | null;
  expires_at?: string | null;
}

/** The key exactly as stored and hashed, or null when it cannot be one. */
export function normalizeLicenseKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const key = raw.trim();
  if (key.length < MIN_LICENSE_KEY_LENGTH || key.length > MAX_LICENSE_KEY_LENGTH) {
    return null;
  }
  return key;
}

export function isLicenseUsable(
  row: LicenseRow | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!row || row.active !== true) return false;
  if (row.expires_at == null) return true;
  const expiresAt = Date.parse(row.expires_at);
  if (Number.isNaN(expiresAt)) return false;
  return expiresAt > now.getTime();
}

type Digest = (algorithm: string, data: BufferSource) => Promise<ArrayBuffer>;

/** Lowercase SHA-256 hex; the plaintext key never leaves this call. */
export async function hashLicenseKey(
  key: string,
  digest: Digest = (algorithm, data) => globalThis.crypto.subtle.digest(algorithm, data),
): Promise<string> {
  const bytes = new TextEncoder().encode(key);
  const hashed = await digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hashed))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
