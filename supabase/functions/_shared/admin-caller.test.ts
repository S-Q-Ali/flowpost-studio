import { describe, it, expect, vi } from "vitest";
import { requireAdminCaller, type AdminCallerDeps } from "./admin-caller.ts";

function makeDeps(overrides: Partial<AdminCallerDeps> = {}): AdminCallerDeps {
  return {
    resolveUserId: vi.fn(async (token: string) =>
      token === "admin-jwt" ? { userId: "admin-1" } : { userId: null },
    ),
    isAdmin: vi.fn(async (userId: string) => ({ admin: userId === "admin-1" })),
    ...overrides,
  };
}

describe("requireAdminCaller", () => {
  it("rejects a request that carries no Authorization header", async () => {
    const deps = makeDeps();
    const result = await requireAdminCaller(null, deps);
    expect(result).toEqual({ allowed: false, status: 401, reason: "missing-token" });
    expect(deps.resolveUserId).not.toHaveBeenCalled();
  });

  it("rejects an empty Authorization header", async () => {
    const deps = makeDeps();
    const result = await requireAdminCaller("Bearer   ", deps);
    expect(result).toEqual({ allowed: false, status: 401, reason: "missing-token" });
    expect(deps.resolveUserId).not.toHaveBeenCalled();
  });

  it("rejects a token Supabase does not recognise", async () => {
    const deps = makeDeps();
    const result = await requireAdminCaller("Bearer not-a-jwt", deps);
    expect(result).toEqual({ allowed: false, status: 401, reason: "invalid-token" });
    expect(deps.isAdmin).not.toHaveBeenCalled();
  });

  it("fails closed when the token lookup itself errors", async () => {
    const deps = makeDeps({
      resolveUserId: vi.fn(async () => ({ userId: null, error: new Error("auth down") })),
    });
    const result = await requireAdminCaller("Bearer admin-jwt", deps);
    expect(result).toEqual({ allowed: false, status: 401, reason: "invalid-token" });
    expect(deps.isAdmin).not.toHaveBeenCalled();
  });

  it("rejects a signed-in user who is not an admin", async () => {
    const deps = makeDeps({
      resolveUserId: vi.fn(async () => ({ userId: "user-2" })),
    });
    const result = await requireAdminCaller("Bearer user-jwt", deps);
    expect(result).toEqual({ allowed: false, status: 401, reason: "not-admin" });
    expect(deps.isAdmin).toHaveBeenCalledWith("user-2");
  });

  it("allows an admin and returns the caller's user id", async () => {
    const deps = makeDeps();
    const result = await requireAdminCaller("Bearer admin-jwt", deps);
    expect(result).toEqual({ allowed: true, userId: "admin-1" });
    expect(deps.resolveUserId).toHaveBeenCalledWith("admin-jwt");
    expect(deps.isAdmin).toHaveBeenCalledWith("admin-1");
  });

  it("tolerates case differences and extra whitespace in the Bearer prefix", async () => {
    const deps = makeDeps();
    const result = await requireAdminCaller("bearer   admin-jwt  ", deps);
    expect(result).toEqual({ allowed: true, userId: "admin-1" });
  });

  it("returns a server error when the admin lookup fails", async () => {
    const deps = makeDeps({
      isAdmin: vi.fn(async () => ({ admin: false, error: new Error("db down") })),
    });
    const result = await requireAdminCaller("Bearer admin-jwt", deps);
    expect(result).toEqual({ allowed: false, status: 500, reason: "lookup-error" });
  });
});
