function getKey(): Promise<CryptoKey> {
  const raw = Deno.env.get("TOKEN_ENCRYPTION_KEY");
  if (!raw) throw new Error("Missing TOKEN_ENCRYPTION_KEY env var");
  const keyBytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encrypt(plaintext: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded,
  );
  const combined = new Uint8Array(12 + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), 12);
  return btoa(String.fromCharCode(...combined));
}

export async function decrypt(ciphertext: string): Promise<string> {
  try {
    const key = await getKey();
    const combined = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      data,
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    return ciphertext;
  }
}

/**
 * The text inside a sealed value, or null when nothing will open it.
 *
 * `decrypt` answers with its input on failure so rows stored before sealing
 * still read; that also makes an unsealed input look like a plaintext value.
 * Anywhere a value arrives from outside this server, equality is the test that
 * tells the two apart, and a forged one must be refused rather than trusted.
 */
export async function openSealed(value: string): Promise<string | null> {
  const opened = await decrypt(value);
  return opened === value ? null : opened;
}
