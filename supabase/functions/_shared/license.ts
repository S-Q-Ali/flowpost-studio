export const MIN_LICENSE_KEY_LENGTH = 16;
export const MAX_LICENSE_KEY_LENGTH = 256;
export const MIN_LICENSE_PEPPER_LENGTH = 16;

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

type HmacSubtle = {
  importKey(
    format: string,
    keyData: BufferSource,
    algorithm: object,
    extractable: boolean,
    keyUsages: string[],
  ): Promise<CryptoKey>;
  sign(algorithm: string, key: CryptoKey, data: BufferSource): Promise<ArrayBuffer>;
};

/**
 * Lowercase HMAC-SHA-256 hex under a server-side pepper. Deterministic, so one
 * key still matches exactly one row, and an offline attacker holding a database
 * dump cannot test guesses without the pepper. The plaintext key never leaves
 * this call.
 */
export async function hashLicenseKey(
  key: string,
  pepper: string,
  subtle: HmacSubtle = globalThis.crypto.subtle,
): Promise<string> {
  if (pepper.length < MIN_LICENSE_PEPPER_LENGTH) {
    throw new Error(
      `A license pepper of at least ${MIN_LICENSE_PEPPER_LENGTH} characters is required`,
    );
  }
  const secret = await subtle.importKey(
    "raw",
    new TextEncoder().encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await subtle.sign(
    "HMAC",
    secret,
    new TextEncoder().encode(key),
  );
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
