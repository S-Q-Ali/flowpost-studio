import { describe, it, expect, afterEach } from "vitest";
import { encrypt, decrypt, openSealed } from "./crypto";

/**
 * crypto reads TOKEN_ENCRYPTION_KEY from the edge runtime's environment, so the
 * tests supply one: Node's WebCrypto, atob and btoa are the same primitives.
 */
function useKey(bytes: string): void {
  const raw = Buffer.from(bytes.padEnd(32, "."), "utf8").toString("base64");
  (globalThis as Record<string, unknown>).Deno = {
    env: { get: (name: string) => (name === "TOKEN_ENCRYPTION_KEY" ? raw : undefined) },
  };
}

function clearKey(): void {
  delete (globalThis as Record<string, unknown>).Deno;
}

afterEach(clearKey);

describe("encrypt / decrypt", () => {
  it("round-trips a value through the seal", async () => {
    useKey("first-key");
    const sealed = await encrypt(JSON.stringify({ file: "clip.mp4" }));
    expect(await decrypt(sealed)).toBe(JSON.stringify({ file: "clip.mp4" }));
  });

  it("answers with the input when nothing will open it", async () => {
    useKey("first-key");
    expect(await decrypt("plain-legacy-value")).toBe("plain-legacy-value");
  });
});

describe("openSealed", () => {
  it("opens a value sealed with this key", async () => {
    useKey("first-key");
    const sealed = await encrypt("a provider token");
    expect(await openSealed(sealed)).toBe("a provider token");
  });

  it("refuses a value that was never sealed", async () => {
    useKey("first-key");
    const forged = '{"megaAccountId":"acct-1","exp":4102444800000}';
    expect(await openSealed(forged)).toBeNull();
  });

  it("refuses a value sealed with another key", async () => {
    useKey("first-key");
    const sealed = await encrypt("a provider token");
    useKey("second-key");
    expect(await openSealed(sealed)).toBeNull();
  });
});
