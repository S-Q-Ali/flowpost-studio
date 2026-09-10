import { describe, it, expect } from "vitest";
import { newOAuthStateValue, createOAuthState, consumeOAuthState } from "./oauth-state.ts";

function makeSupabase(handlers: {
  insert?: (payload: unknown) => Promise<{ error: { message: string } | null }>;
  maybeSingleResult?: unknown;
}) {
  const calls: string[] = [];
  let builder: any;
  builder = {
    insert: (payload: unknown) => {
      calls.push("insert");
      return handlers.insert ? handlers.insert(payload) : Promise.resolve({ error: null });
    },
    update: () => {
      calls.push("update");
      return builder;
    },
    eq: (col: string) => {
      calls.push(`eq:${col}`);
      return builder;
    },
    is: (col: string) => {
      calls.push(`is:${col}`);
      return builder;
    },
    gt: (col: string) => {
      calls.push(`gt:${col}`);
      return builder;
    },
    select: (cols: string) => {
      calls.push(`select:${cols}`);
      return builder;
    },
    maybeSingle: async () => ({ data: handlers.maybeSingleResult, error: null }),
  };
  const supabase = {
    from: (table: string) => {
      calls.push(`from:${table}`);
      return builder;
    },
  };
  return { supabase, calls };
}

describe("newOAuthStateValue", () => {
  it("returns a random 48-hex state string", () => {
    const a = newOAuthStateValue();
    const b = newOAuthStateValue();
    expect(a.state).toMatch(/^[0-9a-f]{48}$/);
    expect(a.state).not.toBe(b.state);
  });

  it("returns an expiry about 10 minutes in the future", () => {
    const { expiresAt } = newOAuthStateValue();
    const diff = new Date(expiresAt).getTime() - Date.now();
    expect(diff).toBeGreaterThan(9 * 60 * 1000);
    expect(diff).toBeLessThanOrEqual(10 * 60 * 1000);
  });
});

describe("createOAuthState", () => {
  it("inserts a single-use, unexpiring row and returns the state", async () => {
    const { supabase, calls } = makeSupabase({});
    const state = await createOAuthState(supabase as never, { userId: "user-1", mode: "facebook" });
    expect(state).toMatch(/^[0-9a-f]{48}$/);
    expect(calls).toContain("from:oauth_states");
    expect(calls).toContain("insert");
  });

  it("insert payload records userId, mode, and a null used_at", async () => {
    let captured: Record<string, unknown> | undefined;
    const { supabase } = makeSupabase({
      insert: async (payload: unknown) => {
        captured = payload as Record<string, unknown>;
        return { error: null };
      },
    });
    await createOAuthState(supabase as never, { userId: "user-1", mode: "instagram" });
    expect(captured?.user_id).toBe("user-1");
    expect(captured?.mode).toBe("instagram");
    expect(captured?.used_at).toBeNull();
    expect(typeof captured?.expires_at).toBe("string");
  });

  it("throws when the insert fails", async () => {
    const { supabase } = makeSupabase({
      insert: async () => ({ error: { message: "unique violation" } }),
    });
    await expect(createOAuthState(supabase as never, { userId: "user-1" })).rejects.toThrow();
  });
});

describe("consumeOAuthState", () => {
  it("claims a valid state atomically and returns the bound user", async () => {
    const { supabase, calls } = makeSupabase({
      maybeSingleResult: { user_id: "user-1", mode: "facebook" },
    });
    const result = await consumeOAuthState(supabase as never, "abc");
    expect(result).toEqual({ userId: "user-1", mode: "facebook" });
    expect(calls).toContain("from:oauth_states");
    expect(calls).toContain("update");
    expect(calls).toContain("eq:state");
    expect(calls).toContain("is:used_at");
    expect(calls).toContain("gt:expires_at");
  });

  it("returns null for an unknown state", async () => {
    const { supabase } = makeSupabase({ maybeSingleResult: undefined });
    expect(await consumeOAuthState(supabase as never, "unknown")).toBeNull();
  });

  it("returns null for an empty state", async () => {
    const { supabase } = makeSupabase({ maybeSingleResult: undefined });
    expect(await consumeOAuthState(supabase as never, "")).toBeNull();
  });
});