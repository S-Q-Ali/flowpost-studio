import { describe, it, expect, vi } from "vitest";
import { createSession, revokeSession, SESSION_TTL_DAYS } from "./session.ts";

function fakeSupabase(insertError: unknown = null) {
  const calls: string[] = [];
  const inserts: unknown[] = [];
  const eq = vi.fn((column: string, value: string) => {
    calls.push(`eq:${column}=${value}`);
    return Promise.resolve({ error: null });
  });
  const insert = vi.fn((row: unknown) => {
    calls.push("insert");
    inserts.push(row);
    return Promise.resolve({ error: insertError });
  });
  const supabase = {
    from: vi.fn((table: string) => {
      calls.push(`from:${table}`);
      return {
        delete: () => ({ eq }),
        insert,
      };
    }),
  };
  return { supabase, calls, inserts, eq, insert };
}

const now = new Date("2026-10-31T12:00:00.000Z");

describe("createSession", () => {
  it("returns a token made of two UUIDs", async () => {
    const { supabase } = fakeSupabase();
    const session = await createSession(supabase, "admin-1", now);
    expect(session.token).toMatch(
      /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}){2}$/,
    );
  });

  it("expires the session exactly seven days after the given instant", async () => {
    const { supabase } = fakeSupabase();
    const session = await createSession(supabase, "admin-1", now);
    const days = (Date.parse(session.expiresAt) - now.getTime()) / 86_400_000;
    expect(days).toBe(SESSION_TTL_DAYS);
  });

  it("clears older sessions for that user only", async () => {
    const { supabase, eq } = fakeSupabase();
    await createSession(supabase, "admin-1", now);
    expect(eq).toHaveBeenCalledWith("user_id", "admin-1");
  });

  it("inserts the token, expiry and the user id", async () => {
    const { supabase, inserts } = fakeSupabase();
    const session = await createSession(supabase, "admin-1", now);
    expect(inserts).toEqual([
      { token: session.token, expires_at: session.expiresAt, user_id: "admin-1" },
    ]);
  });

  it("clears older sessions before inserting the new one", async () => {
    const { supabase, calls } = fakeSupabase();
    await createSession(supabase, "admin-1", now);
    expect(calls).toEqual([
      "from:sessions",
      "eq:user_id=admin-1",
      "from:sessions",
      "insert",
    ]);
  });

  it("throws when the insert fails", async () => {
    const { supabase } = fakeSupabase({ message: "insert failed" });
    await expect(createSession(supabase, "admin-1", now)).rejects.toThrow(
      "Session creation failed",
    );
  });
});

function fakeDeleteSupabase(error: unknown = null) {
  const calls: string[] = [];
  const eq = vi.fn((column: string, value: string) => {
    calls.push(`eq:${column}=${value}`);
    return Promise.resolve({ error });
  });
  const supabase = {
    from: vi.fn((table: string) => {
      calls.push(`from:${table}`);
      return { delete: () => ({ eq }) };
    }),
  };
  return { supabase, calls };
}

describe("revokeSession", () => {
  it("deletes only the presented token", async () => {
    const { supabase, calls } = fakeDeleteSupabase();
    await revokeSession(supabase, "tok-1");
    expect(calls).toEqual(["from:sessions", "eq:token=tok-1"]);
  });

  it("throws when the delete fails", async () => {
    const { supabase } = fakeDeleteSupabase({ message: "delete failed" });
    await expect(revokeSession(supabase, "tok-1")).rejects.toThrow(
      "Session revoke failed",
    );
  });
});
