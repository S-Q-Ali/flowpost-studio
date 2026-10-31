import { describe, it, expect, vi } from "vitest";
import { checkPostAccess, claimPost } from "./post-access";
import type { AuthResult } from "./auth";

const session = (userId: string): AuthResult => ({
  allowed: true,
  kind: "session",
  userId,
});

const serviceRole: AuthResult = { allowed: true, kind: "service-role" };

describe("checkPostAccess", () => {
  it("lets a session publish its own scheduled post", () => {
    const result = checkPostAccess(session("user-1"), {
      user_id: "user-1",
      status: "scheduled",
    });
    expect(result).toEqual({ ok: true });
  });

  it("refuses a session touching another user's post", () => {
    const result = checkPostAccess(session("user-1"), {
      user_id: "user-2",
      status: "scheduled",
    });
    expect(result).toEqual({
      ok: false,
      status: 403,
      error: "Post belongs to another user",
    });
  });

  it("refuses a post that is already published", () => {
    const result = checkPostAccess(serviceRole, {
      user_id: "user-1",
      status: "published",
    });
    expect(result).toEqual({
      ok: false,
      status: 409,
      error: "Post is already published",
    });
  });

  it("lets the scheduler publish a processing post", () => {
    const result = checkPostAccess(serviceRole, {
      user_id: "user-1",
      status: "processing",
    });
    expect(result).toEqual({ ok: true });
  });

  it("trusts a service-role caller for any owner", () => {
    const result = checkPostAccess(serviceRole, {
      user_id: "user-9",
      status: "scheduled",
    });
    expect(result).toEqual({ ok: true });
  });
});

function fakeSupabase(rows: unknown, error: unknown = null) {
  const calls: string[] = [];
  const patches: Record<string, unknown>[] = [];
  const chain: Record<string, any> = {};
  chain.update = vi.fn((patch: Record<string, unknown>) => {
    calls.push("update");
    patches.push(patch);
    return chain;
  });
  chain.eq = vi.fn((column: string) => {
    calls.push(`eq:${column}`);
    return chain;
  });
  chain.is = vi.fn((column: string, value: unknown) => {
    calls.push(`is:${column}=${String(value)}`);
    return chain;
  });
  chain.in = vi.fn((column: string, values: string[]) => {
    calls.push(`in:${column}=${values.join(",")}`);
    return chain;
  });
  chain.select = vi.fn(() => {
    calls.push("select");
    return Promise.resolve({ data: rows, error });
  });
  const supabase = {
    from: vi.fn((table: string) => {
      calls.push(`from:${table}`);
      return chain;
    }),
  };
  return { supabase, calls, patches };
}

const now = new Date("2026-10-31T12:00:00.000Z");

describe("claimPost", () => {
  it("stamps claimed_at on a live post", async () => {
    const { supabase, patches } = fakeSupabase([{ id: "post-1" }]);
    const result = await claimPost(supabase, "post-1", now);
    expect(result).toEqual({ ok: true });
    expect(patches).toEqual([{ claimed_at: now.toISOString() }]);
  });

  it("only claims a post nobody else holds", async () => {
    const { supabase, calls } = fakeSupabase([{ id: "post-1" }]);
    await claimPost(supabase, "post-1", now);
    expect(calls).toEqual([
      "from:posts",
      "update",
      "eq:id",
      "is:claimed_at=null",
      "in:status=scheduled,processing,publishing",
      "select",
    ]);
  });

  it("refuses a post that is already claimed", async () => {
    const { supabase } = fakeSupabase([]);
    const result = await claimPost(supabase, "post-1", now);
    expect(result).toEqual({
      ok: false,
      status: 409,
      error: "Post is already being published",
    });
  });

  it("reports a database failure", async () => {
    const { supabase } = fakeSupabase(null, { message: "db down" });
    const result = await claimPost(supabase, "post-1", now);
    expect(result).toEqual({
      ok: false,
      status: 500,
      error: "Could not claim the post",
    });
  });
});
