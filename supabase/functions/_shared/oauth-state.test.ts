import { readFileSync } from "node:fs";

import { describe, it, expect } from "vitest";
import {
  newOAuthStateValue,
  createOAuthState,
  consumeOAuthState,
  normalizeReturnTo,
  callbackLocation,
  desktopReturnTo,
  connectDoneUrl,
  connectDeclineResponse,
  reportConnectResult,
} from "./oauth-state.ts";

const APP_ORIGIN = "https://flowpost-studio.vercel.app";
const NONCE = "a".repeat(64);
const DESKTOP = `flowpost://connect-callback?platform=youtube&nonce=${NONCE}`;

function makeSupabase(handlers: {
  insert?: (payload: unknown) => Promise<{ error: { message: string } | null }>;
  maybeSingleResult?: unknown;
  deleteThrows?: boolean;
}) {
  const calls: string[] = [];
  const updates: unknown[] = [];
  const builder: any = {
    insert: (payload: unknown) => {
      calls.push("insert");
      return handlers.insert ? handlers.insert(payload) : Promise.resolve({ error: null });
    },
    update: (payload: unknown) => {
      calls.push("update");
      updates.push(payload);
      return builder;
    },
    delete: () => {
      calls.push("delete");
      return {
        lt: (col: string) => {
          calls.push(`lt:${col}`);
          return handlers.deleteThrows
            ? Promise.reject(new Error("the purge blew up"))
            : Promise.resolve({ error: null });
        },
      };
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
    lt: (col: string) => {
      calls.push(`lt:${col}`);
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
  return { supabase, calls, updates };
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

  it("purges long-expired rows so the table does only grow", async () => {
    const { supabase, calls } = makeSupabase({});
    await createOAuthState(supabase as never, { userId: "user-1", mode: "youtube" });
    expect(calls).toContain("from:oauth_states");
    expect(calls).toContain("delete");
    expect(calls).toContain("lt:expires_at");
    expect(calls).toContain("insert");
  });

  it("still starts the connect when the purge blows up", async () => {
    const { supabase } = makeSupabase({ deleteThrows: true });
    const state = await createOAuthState(supabase as never, { userId: "user-1", mode: "youtube" });
    expect(state).toMatch(/^[0-9a-f]{48}$/);
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
  it("answers a desktop wait with the app's own done page", () => {
    // Supabase rewrites text/html to text/plain, so a page served from the
    // function only ever shows the visitor its own source. The app origin can
    // render, and can hand the link to the OS.
    expect(callbackLocation(DESKTOP, APP_ORIGIN, "youtube")).toBe(
      `${APP_ORIGIN}/connect-done?platform=youtube&nonce=${NONCE}&result=connected`,
    );
  });

  it("needs nothing from the caller but the app origin", () => {
    // There is no function-side done page left to wire, so a caller that
    // passes nothing still ends the browser tab.
    const location = callbackLocation(DESKTOP, APP_ORIGIN, "youtube");
    expect(location).toContain("/connect-done");
    expect(location).not.toContain("supabase.co");
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

  it("hands the browser no custom-protocol navigation", () => {
    // A 302 straight to flowpost:// never completes, so the tab spins forever.
    expect(callbackLocation(DESKTOP, APP_ORIGIN, "youtube").startsWith("flowpost://")).toBe(false);
  });
});

describe("connectDoneUrl", () => {
  it.each(["connected", "denied", "failed"])("names the %s outcome on the app page", (result) => {
    expect(connectDoneUrl(APP_ORIGIN, "google_drive", NONCE, result)).toBe(
      `https://flowpost-studio.vercel.app/connect-done?platform=google_drive&nonce=${NONCE}&result=${result}`,
    );
  });

  it("is the page the desktop link is answered from", () => {
    const url = new URL(connectDoneUrl(APP_ORIGIN, "youtube", NONCE, "connected"));
    expect(url.searchParams.get("platform")).toBe("youtube");
    expect(url.searchParams.get("nonce")).toBe(NONCE);
    expect(url.searchParams.get("result")).toBe("connected");
  });
});

describe("reportConnectResult", () => {
  it("writes the outcome on the state row the callback is answering", async () => {
    const { supabase, calls, updates } = makeSupabase({});
    await reportConnectResult(supabase as never, "state-1", "connected");
    expect(calls).toContain("from:oauth_states");
    expect(calls).toContain("update");
    expect(calls).toContain("eq:state");
    expect(updates).toEqual([{ result: "connected" }]);
  });

  it("writes nothing when the callback carried no state", async () => {
    const { supabase, calls } = makeSupabase({});
    await reportConnectResult(supabase as never, "", "failed");
    expect(calls).toEqual([]);
  });

  it("still answers when the table refuses the write", async () => {
    // The browser link is the fast path; a status row that did not save must
    // not break a connect that already worked.
    const builder: any = {
      from: () => {
        throw new Error("the table is down");
      },
    };
    await expect(
      reportConnectResult(builder as never, "state-1", "connected"),
    ).resolves.toBeUndefined();
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

describe("connectDeclineResponse", () => {
  const decline = (
    input: { error: string; returnTo: string | null },
    supabase = makeSupabase({}).supabase,
  ) =>
    connectDeclineResponse({
      ...input,
      supabase: supabase as never,
      state: "state-1",
      appOrigin: APP_ORIGIN,
      platform: "youtube",
    });

  it("sends a refused desktop consent to the app's done page with result=denied", async () => {
    // Google answers a Cancel with error=access_denied. Before this the tab got
    // a bare HTML page, so the app never heard and waited out its timeout.
    const response = await decline({ error: "access_denied", returnTo: DESKTOP });
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      `${APP_ORIGIN}/connect-done?platform=youtube&nonce=${NONCE}&result=denied`,
    );
  });

  it("calls a provider-side breakage failed rather than denied", async () => {
    const response = await decline({ error: "server_error", returnTo: DESKTOP });
    expect(response.headers.get("Location")).toContain("result=failed");
  });

  it("reads the refusal names a user cancelled, not only Google's", async () => {
    // Facebook and LinkedIn report the same cancel as user_denied.
    const response = await decline({ error: "user_denied", returnTo: DESKTOP });
    expect(response.headers.get("Location")).toContain("result=denied");
  });

  it("writes the outcome down so the app can read it without the link", async () => {
    const { supabase, calls, updates } = makeSupabase({});
    await decline({ error: "access_denied", returnTo: DESKTOP }, supabase);
    expect(calls).toContain("from:oauth_states");
    expect(calls).toContain("eq:state");
    expect(updates).toEqual([{ result: "denied" }]);
  });

  it("hands the browser no custom-protocol navigation", async () => {
    const response = await decline({ error: "access_denied", returnTo: DESKTOP });
    expect((response.headers.get("Location") ?? "").startsWith("flowpost://")).toBe(false);
  });

  it("tells a web flow the connect was refused, on a page it can render", async () => {
    // The web app never waits on a nonce, and a page served from the function
    // shows it only source; the accounts page is the one place that can speak.
    const response = await decline({ error: "access_denied", returnTo: `${APP_ORIGIN}/accounts` });
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(`${APP_ORIGIN}/accounts?declined=youtube`);
  });

  it("still sends a refused connect with no wait back to the app", async () => {
    const response = await decline({ error: "access_denied", returnTo: null });
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(`${APP_ORIGIN}/accounts?declined=youtube`);
  });

  it("never echoes the provider's own text into the answer", async () => {
    // The error query parameter is caller-supplied and the answer carries the
    // function's own origin, so an echo would be script in that origin.
    const response = await decline({
      error: '<script>alert("steal")</script>',
      returnTo: null,
    });
    expect(response.headers.get("Location")).not.toContain("alert");
    expect(await response.text()).not.toContain("<script>");
  });

  it("names a foreign return_to nowhere in the answer", async () => {
    const response = await decline({
      error: "access_denied",
      returnTo: "https://evil.example/accounts",
    });
    expect(response.headers.get("Location")).not.toContain("evil.example");
  });
});

describe("the auth functions serve no page of their own", () => {
  const slugs = [
    "facebook-auth",
    "google-drive-auth",
    "instagram-auth",
    "linkedin-auth",
    "tiktok-auth",
    "youtube-auth",
  ];

  it.each(slugs)("%s sends the browser to the app origin, never its own", (slug) => {
    // Supabase answers a text/html body with text/plain and a sandbox CSP, so
    // HTML from an edge function is source code in the tab, never a page.
    const source = readFileSync(`supabase/functions/${slug}/index.ts`, "utf8");
    expect(source).not.toContain("donePageUrl(");
    expect(source).not.toContain("connectDoneResponse(");
    expect(source).not.toContain("${url.origin}${url.pathname}");
  });

  it.each(slugs)("%s answers a refused consent through the shared decline path", (slug) => {
    const source = readFileSync(`supabase/functions/${slug}/index.ts`, "utf8");
    expect(source).toContain("connectDeclineResponse(");
    expect(source).not.toContain("Connection failed</h2>");
  });

  it.each(slugs)("%s writes the outcome of a callback it finished", (slug) => {
    // The desktop reads this row when no browser link reaches it, so a connect
    // that ended silently cannot leave the app waiting for ten minutes.
    const source = readFileSync(`supabase/functions/${slug}/index.ts`, "utf8");
    expect(source).toMatch(/reportConnectResult\(supabaseAdmin,[^)]*"connected"\)/);
  });
});