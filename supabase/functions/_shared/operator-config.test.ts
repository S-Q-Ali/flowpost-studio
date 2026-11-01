import { describe, it, expect } from "vitest";
import {
  OPERATOR_CONFIG_NAMES,
  MAX_CONFIG_VALUE_LENGTH,
  configRejection,
  configStatusValues,
  parseConfigWrite,
  presentConfigNames,
  resolveConfigCaller,
} from "./operator-config.ts";

describe("the allowlist", () => {
  it("holds every name the guided setup offers for the server", () => {
    // The wizard's own list lives in
    // desktop-flutter/lib/features/setup/domain/setup_steps.dart; these are the
    // same names, so what the user fills in is what the server accepts.
    expect([...OPERATOR_CONFIG_NAMES].sort()).toEqual(
      [
        "GROQ_API_KEY",
        "R2_ENDPOINT",
        "R2_ACCESS_KEY",
        "R2_SECRET_KEY",
        "R2_BUCKET",
        "R2_PUBLIC_URL",
        "YT_CLIENT_ID",
        "YT_CLIENT_SECRET",
        "GD_CLIENT_ID",
        "GD_CLIENT_SECRET",
        "IG_APP_ID",
        "IG_APP_SECRET",
        "FB_APP_ID",
        "FB_APP_SECRET",
        "TIKTOK_CLIENT_KEY",
        "TIKTOK_CLIENT_SECRET",
        "LINKEDIN_CLIENT_ID",
        "LINKEDIN_CLIENT_SECRET",
      ].sort(),
    );
  });

  it("never offers the keys that belong to the deployment itself", () => {
    for (
      const forbidden of [
        "SUPABASE_SERVICE_ROLE_KEY",
        "SERVICE_ROLE_KEY",
        "SUPABASE_ANON_KEY",
        "ANON_KEY",
        "TOKEN_ENCRYPTION_KEY",
        "SUPABASE_URL",
        "CRON_API_KEY",
        "GROQ_API_KEY_KEY",
      ]
    ) {
      expect(OPERATOR_CONFIG_NAMES).not.toContain(forbidden);
    }
  });

  it("holds no duplicate", () => {
    expect(new Set(OPERATOR_CONFIG_NAMES).size).toBe(OPERATOR_CONFIG_NAMES.length);
  });
});

describe("parseConfigWrite", () => {
  it("keeps an allowed name with a usable value", () => {
    const parsed = parseConfigWrite({ values: { GROQ_API_KEY: "gsk_real_value_1" } });
    expect(parsed.ok).toBe(true);
    expect(parsed.values).toEqual({ GROQ_API_KEY: "gsk_real_value_1" });
  });

  it("trims the whitespace a pasted key brings along", () => {
    const parsed = parseConfigWrite({ values: { R2_BUCKET: "  media-bucket\n" } });
    expect(parsed.ok).toBe(true);
    expect(parsed.values).toEqual({ R2_BUCKET: "media-bucket" });
  });

  it("refuses a name outside the allowlist and never repeats the value", () => {
    const parsed = parseConfigWrite({
      values: { SUPABASE_SERVICE_ROLE_KEY: "super-secret-value" },
    });
    expect(parsed.ok).toBe(false);
    expect(parsed.status).toBe(400);
    expect(parsed.error).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(parsed.error).not.toContain("super-secret-value");
  });

  it("refuses a name that is not written as an environment variable", () => {
    for (const name of ["groq_api_key", " GROQ_API_KEY", "", "GROQ-API-KEY"]) {
      const parsed = parseConfigWrite({ values: { [name]: "value-1" } });
      expect(parsed.ok).toBe(false);
      expect(parsed.error).not.toContain("value-1");
    }
  });

  it("refuses a payload with nothing to store", () => {
    for (const body of [undefined, null, {}, { values: {} }, { values: null }, "text"]) {
      expect(parseConfigWrite(body).ok).toBe(false);
    }
  });

  it("refuses a value that is not a string", () => {
    for (const value of [42, true, null, { a: 1 }, ["a"]]) {
      const parsed = parseConfigWrite({ values: { GROQ_API_KEY: value } });
      expect(parsed.ok).toBe(false);
      expect(parsed.status).toBe(400);
    }
  });

  it("refuses an empty value, because a step is either set or not", () => {
    for (const value of ["", "   ", "\n"]) {
      expect(parseConfigWrite({ values: { R2_BUCKET: value } }).ok).toBe(false);
    }
  });

  it("refuses a value that cannot be one credential", () => {
    expect(parseConfigWrite({ values: { GROQ_API_KEY: "line one\nline two" } }).ok)
      .toBe(false);
  });

  it("refuses a value longer than the cap and accepts one exactly at it", () => {
    expect(
      parseConfigWrite({ values: { R2_ENDPOINT: "a".repeat(MAX_CONFIG_VALUE_LENGTH + 1) } })
        .error,
    ).toContain("too long");
    expect(
      parseConfigWrite({ values: { R2_ENDPOINT: "b".repeat(MAX_CONFIG_VALUE_LENGTH) } }).ok,
    ).toBe(true);
  });

  it("refuses a payload that hides a prototype key among the values", () => {
    const body = JSON.parse('{"values": {"__proto__": "x", "GROQ_API_KEY": "y"}}');
    const parsed = parseConfigWrite(body);
    expect(parsed.ok).toBe(false);
    expect(parsed.status).toBe(400);
  });

  it("stores every name of one step in a single call", () => {
    const meta = {
      IG_APP_ID: "ig-app-id",
      IG_APP_SECRET: "ig-app-secret",
      FB_APP_ID: "fb-app-id",
      FB_APP_SECRET: "fb-app-secret",
    };
    const parsed = parseConfigWrite({ values: meta });
    expect(parsed.ok).toBe(true);
    expect(parsed.values).toEqual(meta);
  });
});

describe("presentConfigNames", () => {
  it("reads names out of rows and keeps none of their values", () => {
    const rows = [
      { name: "GROQ_API_KEY", value: "encrypted-blob" },
      { name: "R2_BUCKET", value: "encrypted-blob" },
    ];
    expect(presentConfigNames(rows)).toEqual(["GROQ_API_KEY", "R2_BUCKET"]);
  });

  it("drops a name the app no longer knows", () => {
    expect(presentConfigNames([{ name: "OLD_PROVIDER_KEY" }, { name: "R2_BUCKET" }]))
      .toEqual(["R2_BUCKET"]);
  });

  it("treats a missing or broken row set as nothing configured", () => {
    for (const rows of [undefined, null, [], "text", [{ nope: 1 }]]) {
      expect(presentConfigNames(rows as never)).toEqual([]);
    }
  });
});

describe("configStatusValues", () => {
  it("answers for every allowed name, so the wizard needs no other list", () => {
    const values = configStatusValues(["GROQ_API_KEY"]);
    expect(Object.keys(values).sort()).toEqual([...OPERATOR_CONFIG_NAMES].sort());
    expect(values.GROQ_API_KEY).toBe(true);
    expect(values.R2_BUCKET).toBe(false);
  });

  it("carries no stored value in the answer", () => {
    const values = configStatusValues(["GROQ_API_KEY", "FB_APP_SECRET"]);
    expect(Object.values(values).every((v) => typeof v === "boolean")).toBe(true);
    expect(Object.values(values).filter((v) => v).length).toBe(2);
  });

  it("reports nothing as set when no row exists", () => {
    const values = configStatusValues([]);
    expect(Object.values(values).every((set) => set === false)).toBe(true);
  });
});

describe("configRejection", () => {
  it("lets our own backend through", () => {
    expect(configRejection({ kind: "service-role", isAdmin: false })).toBeNull();
  });

  it("lets an operator session through", () => {
    expect(configRejection({ kind: "session", isAdmin: true })).toBeNull();
  });

  it("refuses an unauthenticated caller with 401", () => {
    expect(configRejection(null)).toBe(401);
  });

  it("refuses a scheduled job, which never manages keys", () => {
    expect(configRejection({ kind: "cron", isAdmin: true })).toBe(403);
  });

  it("refuses a licensed user who does not run this server", () => {
    expect(configRejection({ kind: "session", isAdmin: false })).toBe(403);
  });
});

type UsersResult = { data?: unknown; error?: unknown };

/** The one read the boundary makes: the caller's row in `public.users`. */
function fakeUsers(result: UsersResult) {
  const reads: string[] = [];
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => {
      reads.push("users");
      return result;
    },
  };
  return { client: { from: () => query }, reads };
}

describe("resolveConfigCaller", () => {
  it("answers 401 for a bearer the auth helper refused", async () => {
    const { client, reads } = fakeUsers({ data: { is_admin: true } });
    const caller = await resolveConfigCaller(client, {
      allowed: false,
      reason: "no-credentials",
    });
    expect(caller).toBeNull();
    expect(configRejection(caller)).toBe(401);
    expect(reads).toEqual([]);
  });

  it("trusts our own backend without reading any row", async () => {
    const { client, reads } = fakeUsers({ data: null });
    const caller = await resolveConfigCaller(client, { allowed: true, kind: "service-role" });
    expect(caller).toEqual({ kind: "service-role", isAdmin: false });
    expect(configRejection(caller)).toBeNull();
    expect(reads).toEqual([]);
  });

  it("checks the account behind a session bearer", async () => {
    const { client, reads } = fakeUsers({ data: { is_admin: true } });
    const caller = await resolveConfigCaller(client, {
      allowed: true,
      kind: "session",
      userId: "operator-user",
    });
    expect(caller).toEqual({ kind: "session", isAdmin: true });
    expect(reads).toEqual(["users"]);
  });

  it("refuses a session whose account is not the operator", async () => {
    const { client } = fakeUsers({ data: { is_admin: false } });
    const caller = await resolveConfigCaller(client, {
      allowed: true,
      kind: "session",
      userId: "licensed-user",
    });
    expect(configRejection(caller)).toBe(403);
  });

  it("refuses when the account row cannot be read", async () => {
    const { client } = fakeUsers({ data: { is_admin: true }, error: { message: "down" } });
    const caller = await resolveConfigCaller(client, {
      allowed: true,
      kind: "session",
      userId: "licensed-user",
    });
    expect(configRejection(caller)).toBe(403);
  });

  it("refuses a session that resolves to no account", async () => {
    const { client, reads } = fakeUsers({ data: { is_admin: true } });
    const caller = await resolveConfigCaller(client, {
      allowed: true,
      kind: "session",
      userId: "",
    });
    expect(configRejection(caller)).toBe(403);
    expect(reads).toEqual([]);
  });
});
