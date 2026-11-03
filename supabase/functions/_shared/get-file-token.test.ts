import { describe, it, expect, afterEach } from "vitest";
import { fileProxyUrl } from "./get-file-token";
import { openSealed } from "./crypto";

/** The edge runtime's environment, supplied the way the functions read it. */
function useRuntimeEnv(values: Record<string, string>): void {
  (globalThis as Record<string, unknown>).Deno = { env: { get: (name: string) => values[name] } };
}

afterEach(() => {
  delete (globalThis as Record<string, unknown>).Deno;
});

const KEY = { TOKEN_ENCRYPTION_KEY: Buffer.from("a-test-token-key".padEnd(32, "."), "utf8").toString("base64") };

describe("fileProxyUrl", () => {
  it("mints a sealed token that carries the owner it was made for", async () => {
    useRuntimeEnv({ ...KEY, SUPABASE_URL: "https://project.supabase.co" });
    const url = await fileProxyUrl({ megaFileName: "clip.mp4", megaAccountId: "row-1" }, "user-1");
    const payload = JSON.parse(
      await openSealed(decodeURIComponent(new URL(url).searchParams.get("token")!)) ?? "",
    );
    expect(payload).toMatchObject({ megaFileName: "clip.mp4", megaAccountId: "row-1", userId: "user-1" });
  });

  it("always sets the fifteen-minute expiry the reader requires", async () => {
    useRuntimeEnv({ ...KEY, SUPABASE_URL: "https://project.supabase.co" });
    const url = await fileProxyUrl({ driveUrl: "https://www.googleapis.com/f", driveToken: "t" }, "user-1");
    const payload = JSON.parse(
      await openSealed(decodeURIComponent(new URL(url).searchParams.get("token")!)) ?? "",
    );
    expect(payload.exp).toBeGreaterThan(Date.now());
    expect(payload.exp).toBeLessThanOrEqual(Date.now() + 15 * 60 * 1000);
  });

  it("points at the get-file endpoint only", async () => {
    useRuntimeEnv({ ...KEY, SUPABASE_URL: "https://project.supabase.co" });
    const url = await fileProxyUrl({ megaUrl: "https://mega.nz/x" }, "user-1");
    expect(new URL(url).origin + new URL(url).pathname).toBe(
      "https://project.supabase.co/functions/v1/get-file",
    );
  });
});
