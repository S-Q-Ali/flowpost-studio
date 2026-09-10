import { describe, it, expect, vi } from "vitest";
import {
  shouldRefreshToken,
  buildRefreshUrl,
  getDriveToken,
  type DriveTokenContext,
} from "./google-drive";

const NOW = new Date("2026-01-01T00:00:00.000Z");

function fakeSupabase(results: Array<{ data: unknown; error: unknown }>) {
  const queue = [...results];
  const calls = { maybeSingle: 0, single: 0 };
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: () => {
      calls.maybeSingle += 1;
      return Promise.resolve(queue.shift() ?? { data: null, error: null });
    },
    single: () => {
      calls.single += 1;
      return Promise.resolve(queue.shift() ?? { data: null, error: null });
    },
  };
  return { from: () => builder, calls };
}

function makeCtx(overrides: Partial<DriveTokenContext> = {}) {
  const fetchMock = vi.fn(async () => ({ ok: true }));
  const ctx: DriveTokenContext = {
    supabase: fakeSupabase([]),
    decrypt: async (cipher: string) => cipher.replace(/^enc:/, ""),
    fetch: fetchMock,
    now: () => NOW,
    supabaseUrl: "https://xyz.supabase.co",
    serviceRoleKey: "svc-key",
    ...overrides,
  };
  return { ctx, fetchMock };
}

function account(overrides: Record<string, unknown> = {}) {
  return {
    access_token: "enc:existing",
    refresh_token: "enc:refresh",
    token_expiry: "2990-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("shouldRefreshToken", () => {
  it("returns false when there is no expiry", () => {
    expect(shouldRefreshToken(null, NOW)).toBe(false);
    expect(shouldRefreshToken(undefined, NOW)).toBe(false);
  });

  it("returns false for an expiry far in the future", () => {
    expect(shouldRefreshToken("2990-01-01T00:00:00.000Z", NOW)).toBe(false);
  });

  it("returns true when the token expires within 5 minutes", () => {
    const soon = new Date(NOW.getTime() + 4 * 60 * 1000).toISOString();
    expect(shouldRefreshToken(soon, NOW)).toBe(true);
  });

  it("returns true when the token is already past expiry", () => {
    expect(shouldRefreshToken("2025-01-01T00:00:00.000Z", NOW)).toBe(true);
  });

  it("returns false for an unparseable expiry", () => {
    expect(shouldRefreshToken("not-a-date", NOW)).toBe(false);
  });
});

describe("buildRefreshUrl", () => {
  it("builds the refresh URL with user and action", () => {
    expect(buildRefreshUrl("https://xyz.supabase.co", "user-1")).toBe(
      "https://xyz.supabase.co/functions/v1/google-drive-auth?action=refresh&user_id=user-1",
    );
  });

  it("appends the account id when present", () => {
    expect(buildRefreshUrl("https://xyz.supabase.co", "user-1", "account-9")).toBe(
      "https://xyz.supabase.co/functions/v1/google-drive-auth?action=refresh&user_id=user-1&account_id=account-9",
    );
  });
});

describe("getDriveToken", () => {
  it("returns null when no connected account exists", async () => {
    const { ctx } = makeCtx();
    ctx.supabase = fakeSupabase([{ data: null, error: null }]);
    expect(await getDriveToken("u1", null, ctx)).toBeNull();
  });

  it("returns null when the account query errors", async () => {
    const { ctx } = makeCtx();
    ctx.supabase = fakeSupabase([{ data: null, error: { message: "boom" } }]);
    expect(await getDriveToken("u1", null, ctx)).toBeNull();
  });

  it("returns null when the account has no access token", async () => {
    const { ctx, fetchMock } = makeCtx();
    ctx.supabase = fakeSupabase([{ data: account({ access_token: null }), error: null }]);
    expect(await getDriveToken("u1", null, ctx)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the decrypted token when it is not expiring", async () => {
    const { ctx, fetchMock } = makeCtx();
    ctx.supabase = fakeSupabase([{ data: account(), error: null }]);
    expect(await getDriveToken("u1", null, ctx)).toBe("existing");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("queries by drive account id when one is provided", async () => {
    const { ctx } = makeCtx();
    ctx.supabase = fakeSupabase([{ data: account({ access_token: "enc:scoped" }), error: null }]);
    expect(await getDriveToken("u1", "account-9", ctx)).toBe("scoped");
  });

  it("refreshes when the token is expiring soon and returns the new token", async () => {
    const { ctx, fetchMock } = makeCtx();
    const supabase = fakeSupabase([
      { data: account({ token_expiry: new Date(NOW.getTime() + 60 * 1000).toISOString() }), error: null },
      { data: { access_token: "enc:new" }, error: null },
    ]);
    ctx.supabase = supabase;
    expect(await getDriveToken("u1", "account-9", ctx)).toBe("new");
    expect(supabase.calls.single).toBe(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://xyz.supabase.co/functions/v1/google-drive-auth?action=refresh&user_id=u1&account_id=account-9",
      { headers: { Authorization: "Bearer svc-key" } },
    );
  });

  it("falls back to the existing token when the refresh request fails", async () => {
    const failingFetch = vi.fn(async () => ({ ok: false }));
    const { ctx } = makeCtx({ fetch: failingFetch });
    const supabase = fakeSupabase([
      { data: account({ token_expiry: new Date(NOW.getTime() + 60 * 1000).toISOString() }), error: null },
    ]);
    ctx.supabase = supabase;
    expect(await getDriveToken("u1", null, ctx)).toBe("existing");
    expect(supabase.calls.single).toBe(0);
    expect(failingFetch).toHaveBeenCalledTimes(1);
  });

  it("falls back to the existing token when the refreshed record is empty", async () => {
    const { ctx } = makeCtx();
    ctx.supabase = fakeSupabase([
      { data: account({ token_expiry: new Date(NOW.getTime() + 60 * 1000).toISOString() }), error: null },
      { data: null, error: null },
    ]);
    expect(await getDriveToken("u1", null, ctx)).toBe("existing");
  });
});