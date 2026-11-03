import { describe, it, expect, vi } from "vitest";
import { findAdminUserId } from "./admin-user";

function fakeSupabase(data: unknown, error: unknown = null) {
  const chain: Record<string, any> = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => Promise.resolve({ data, error }),
  };
  return { from: vi.fn(() => chain) } as any;
}

describe("findAdminUserId", () => {
  it("returns the id of the admin row", async () => {
    expect(await findAdminUserId(fakeSupabase({ id: "user-1" }))).toBe("user-1");
  });

  it("returns null when no user is an admin", async () => {
    expect(await findAdminUserId(fakeSupabase(null))).toBeNull();
  });

  it("returns null when the read fails", async () => {
    expect(await findAdminUserId(fakeSupabase(null, { message: "db down" }))).toBeNull();
  });
});
