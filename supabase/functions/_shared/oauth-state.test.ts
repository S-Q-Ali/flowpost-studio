import { describe, it, expect } from "vitest";
import {
  newOAuthStateValue,
  createOAuthState,
  consumeOAuthState,
  normalizeReturnTo,
  callbackLocation,
  desktopReturnTo,
} from "./oauth-state.ts";

const APP_ORIGIN = "https://flowpost-studio.vercel.app";
const NONCE = "a".repeat(64);

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
    expect(result).toEqual({ userId: "user-1", mode: "facebook", returnTo: null });
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

describe("normalizeReturnTo", () => {
  const desktop = `flowpost://connect-callback?platform=youtube&nonce=${NONCE}`;

  it("accepts a desktop connect callback whole", () => {
    expect(normalizeReturnTo(desktop, APP_ORIGIN)).toBe(desktop);
  });

  it("accepts every server platform token on the desktop link", () => {
    for (const platform of ["youtube", "instagram", "facebook", "tiktok", "linkedin", "google_drive", "mega"]) {
      const link = `flowpost://connect-callback?platform=${platform}&nonce=${NONCE}`;
      expect(normalizeReturnTo(link, APP_ORIGIN)).toBe(link);
    }
  });

  it("refuses a desktop link without a platform", () => {
    expect(normalizeReturnTo(`flowpost://connect-callback?nonce=${NONCE}`, APP_ORIGIN)).toBeNull();
  });

  it("refuses a desktop link with a platform the server does not know", () => {
    expect(normalizeReturnTo(`flowpost://connect-callback?platform=myspace&nonce=${NONCE}`, APP_ORIGIN)).toBeNull();
  });

  it("refuses a desktop link whose nonce is not 32 bytes of lower-case hex", () => {
    expect(normalizeReturnTo("flowpost://connect-callback?platform=youtube&nonce=" + "a".repeat(32), APP_ORIGIN)).toBeNull();
    expect(normalizeReturnTo(`flowpost://connect-callback?platform=youtube&nonce=${NONCE}aa`, APP_ORIGIN)).toBeNull();
    expect(normalizeReturnTo(`flowpost://connect-callback?platform=youtube&nonce=${"A".repeat(64)}`, APP_ORIGIN)).toBeNull();
    expect(normalizeReturnTo(`flowpost://connect-callback?platform=youtube&nonce=${"z".repeat(64)}`, APP_ORIGIN)).toBeNull();
    expect(normalizeReturnTo("flowpost://connect-callback?platform=youtube", APP_ORIGIN)).toBeNull();
  });

  it("refuses a flowpost link to any host but the callback", () => {
    expect(normalizeReturnTo(`flowpost://accounts?platform=youtube&nonce=${NONCE}`, APP_ORIGIN)).toBeNull();
    expect(normalizeReturnTo(`flowpost://connect-callback/../../accounts?platform=youtube&nonce=${NONCE}`, APP_ORIGIN)).toBeNull();
  });

  it("refuses a desktop link carrying a result the app did not earn", () => {
    expect(normalizeReturnTo(`${desktop}&result=connected`, APP_ORIGIN)).toBeNull();
  });

  it("accepts an app-origin http(s) URL and only that origin", () => {
    expect(normalizeReturnTo(`${APP_ORIGIN}/accounts`, APP_ORIGIN)).toBe(`${APP_ORIGIN}/accounts`);
    expect(normalizeReturnTo(`${APP_ORIGIN}.evil.example/accounts`, APP_ORIGIN)).toBeNull();
    expect(normalizeReturnTo("https://evil.example/accounts", APP_ORIGIN)).toBeNull();
  });

  it("refuses anything that is not an absolute http(s) or flowpost URL", () => {
    expect(normalizeReturnTo("/accounts", APP_ORIGIN)).toBeNull();
    expect(normalizeReturnTo("//evil.example/accounts", APP_ORIGIN)).toBeNull();
    expect(normalizeReturnTo("javascript:alert(1)", APP_ORIGIN)).toBeNull();
    expect(normalizeReturnTo("", APP_ORIGIN)).toBeNull();
  });

  it("refuses a link whose platform is not the one the state row is keyed to", () => {
    const link = `flowpost://connect-callback?platform=tiktok&nonce=${NONCE}`;
    expect(normalizeReturnTo(link, APP_ORIGIN, "youtube")).toBeNull();
    expect(normalizeReturnTo(link, APP_ORIGIN, "tiktok")).toBe(link);
    expect(normalizeReturnTo(link, APP_ORIGIN)).toBe(link);
  });
});

describe("desktopReturnTo", () => {
  it("builds exactly the link the desktop parser answers", () => {
    expect(desktopReturnTo("youtube", NONCE)).toBe(`flowpost://connect-callback?platform=youtube&nonce=${NONCE}`);
    expect(normalizeReturnTo(desktopReturnTo("tiktok", NONCE), APP_ORIGIN, "tiktok")).not.toBeNull();
  });
});

describe("callbackLocation", () => {
  const desktop = `flowpost://connect-callback?platform=youtube&nonce=${NONCE}`;

  it("answers a desktop wait with the outcome, keeping its nonce", () => {
    expect(callbackLocation(desktop, APP_ORIGIN, "youtube")).toBe(`${desktop}&result=connected`);
  });

  it("falls back to the app accounts page for a web flow", () => {
    expect(callbackLocation(null, APP_ORIGIN, "youtube")).toBe(`${APP_ORIGIN}/accounts?connected=youtube`);
  });

  it("sends a stored app-origin link back with the connected flag", () => {
    expect(callbackLocation(`${APP_ORIGIN}/accounts`, APP_ORIGIN, "tiktok")).toBe(`${APP_ORIGIN}/accounts?connected=tiktok`);
  });

  it("keeps a query the web flow already asked for", () => {
    expect(callbackLocation(`${APP_ORIGIN}/accounts?tab=recent`, APP_ORIGIN, "facebook")).toBe(`${APP_ORIGIN}/accounts?tab=recent&connected=facebook`);
  });

  it("never puts a foreign host in the location", () => {
    const location = callbackLocation("https://evil.example/accounts", APP_ORIGIN, "youtube");
    expect(location).not.toContain("evil.example");
    expect(new URL(location).origin).toBe(APP_ORIGIN);
  });

  it("answers a desktop wait that somehow holds a foreign link with the fallback", () => {
    // return_to is normalised before storing, so this only fires on hand-written
    // rows; the caller still must not send the browser to the attacker host.
    expect(callbackLocation(`flowpost://evil/step?platform=youtube&nonce=${NONCE}`, APP_ORIGIN, "youtube")).toBe(
      `${APP_ORIGIN}/accounts?connected=youtube`,
    );
  });
});

describe("return_to through the state row", () => {
  it("inserts the normalized desktop link and selects return_to back", async () => {
    let captured: Record<string, unknown> | undefined;
    const { supabase, calls } = makeSupabase({
      insert: async (payload: unknown) => {
        captured = payload as Record<string, unknown>;
        return { error: null };
      },
    });
    const desktop = `flowpost://connect-callback?platform=youtube&nonce=${NONCE}`;
    await createOAuthState(supabase as never, { userId: "user-1", mode: "youtube", returnTo: desktop });
    expect(captured?.return_to).toBe(desktop);
    // The consume side has to hand return_to back to the callback.
    void calls;
    const { supabase: s2 } = makeSupabase({ maybeSingleResult: { user_id: "u", mode: "youtube", return_to: desktop } });
    const consumed = await consumeOAuthState(s2 as never, "abc");
    expect(consumed?.returnTo).toBe(desktop);
  });

  it("stores a null return_to when the caller gives nothing usable", async () => {
    let captured: Record<string, unknown> | undefined;
    const { supabase } = makeSupabase({
      insert: async (payload: unknown) => {
        captured = payload as Record<string, unknown>;
        return { error: null };
      },
    });
    await createOAuthState(supabase as never, { userId: "user-1", returnTo: "https://evil.example/x" });
    expect(captured?.return_to).toBeNull();
  });
});