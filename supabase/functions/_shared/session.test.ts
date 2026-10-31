import { describe, it, expect, vi } from "vitest";
import { createSession, SESSION_TTL_DAYS, EMPTY_SESSION_ID } from "./session.ts";

function fakeSupabase(insertError: unknown = null) {
  const calls: string[] = [];
  const inserts: unknown[] = [];
  const neq = vi.fn((column: string, value: string) => {
    calls.push(`neq:${column}=${value}`);
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
        delete: () => ({ neq }),
        insert,
      };
    }),
  };
  return { supabase, calls, inserts, neq, insert };
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

  it("clears every older session except the empty sentinel row", async () => {
    const { supabase, neq } = fakeSupabase();
    await createSession(supabase, "admin-1", now);
    expect(neq).toHaveBeenCalledWith("id", EMPTY_SESSION_ID);
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
      `neq:id=${EMPTY_SESSION_ID}`,
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
