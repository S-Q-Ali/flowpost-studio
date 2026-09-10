import { describe, it, expect, vi } from "vitest";
import {
  isRequestAuthorized,
  createSessionLookup,
  type SessionLookupResult,
  type AuthInputs,
} from "./auth";

function makeInputs(overrides: Partial<AuthInputs>): AuthInputs {
  return {
    authorizationHeader: null,
    adminTokenHeader: null,
    apiKeyHeader: null,
    serviceRoleKey: "service-role-key",
    cronApiKey: "cron-key",
    frontendApiKey: "frontend-key",
    anonKey: "public-anon-key",
    sessionLookup: vi.fn(async () => ({ status: "missing" })),
    ...overrides,
  };
}

describe("isRequestAuthorized", () => {
  it("rejects a request that presents no credentials at all", async () => {
    const inputs = makeInputs({ cronApiKey: null });
    const result = await isRequestAuthorized(inputs);
    expect(result).toEqual({ allowed: false, reason: "no-credentials" });
  });

  it("rejects an Authorization header that is not a known credential and no session", async () => {
    const inputs = makeInputs({
      authorizationHeader: "Bearer random-token",
      cronApiKey: null,
    });
    const result = await isRequestAuthorized(inputs);
    expect(result).toEqual({ allowed: false, reason: "invalid-session" });
  });

  it("rejects the public anon key used as a Bearer credential", async () => {
    const inputs = makeInputs({ authorizationHeader: "Bearer public-anon-key" });
    const result = await isRequestAuthorized(inputs);
    expect(result).toEqual({ allowed: false, reason: "anon-key" });
    expect(inputs.sessionLookup).not.toHaveBeenCalled();
  });

  it("rejects the public anon key even when sent via x-admin-token", async () => {
    const inputs = makeInputs({ adminTokenHeader: "public-anon-key" });
    const result = await isRequestAuthorized(inputs);
    expect(result).toEqual({ allowed: false, reason: "anon-key" });
    expect(inputs.sessionLookup).not.toHaveBeenCalled();
  });

  it("fails closed when the session lookup itself errors", async () => {
    const inputs = makeInputs({
      authorizationHeader: "Bearer session-token",
      sessionLookup: vi.fn(async () => ({ status: "error", error: new Error("db down") })),
    });
    const result = await isRequestAuthorized(inputs);
    expect(result).toEqual({ allowed: false, reason: "session-lookup-error" });
  });

  it("rejects an expired session token", async () => {
    const inputs = makeInputs({
      authorizationHeader: "Bearer expired-token",
      sessionLookup: vi.fn(async (token: string) =>
        token === "expired-token" ? { status: "expired" } : { status: "missing" },
      ),
    });
    const result = await isRequestAuthorized(inputs);
    expect(result).toEqual({ allowed: false, reason: "expired-session" });
  });

  it("allows a valid session token sent via the Authorization header (captions pattern)", async () => {
    const inputs = makeInputs({
      authorizationHeader: "Bearer valid-session-token",
      sessionLookup: vi.fn(async (token: string) =>
        token === "valid-session-token" ? { status: "valid" } : { status: "missing" },
      ),
    });
    const result = await isRequestAuthorized(inputs);
    expect(result).toEqual({ allowed: true, kind: "session" });
  });

  it("allows a valid session token sent via the x-admin-token header (process-workflow pattern)", async () => {
    const inputs = makeInputs({
      adminTokenHeader: "valid-admin-token",
      sessionLookup: vi.fn(async (token: string) =>
        token === "valid-admin-token" ? { status: "valid" } : { status: "missing" },
      ),
    });
    const result = await isRequestAuthorized(inputs);
    expect(result).toEqual({ allowed: true, kind: "session" });
  });

  it("rejects a session token when the lookup returns missing / unknown", async () => {
    const inputs = makeInputs({ authorizationHeader: "Bearer unknown-token" });
    const result = await isRequestAuthorized(inputs);
    expect(result).toEqual({ allowed: false, reason: "invalid-session" });
  });

  it("allows the service role key and never consults the session lookup", async () => {
    const inputs = makeInputs({ authorizationHeader: "Bearer service-role-key" });
    const result = await isRequestAuthorized(inputs);
    expect(result).toEqual({ allowed: true, kind: "service-role" });
    expect(inputs.sessionLookup).not.toHaveBeenCalled();
  });

  it("allows an operator request that carries both service key and a session header", async () => {
    const inputs = makeInputs({
      authorizationHeader: "Bearer service-role-key",
      adminTokenHeader: "some-token",
    });
    const result = await isRequestAuthorized(inputs);
    expect(result).toEqual({ allowed: true, kind: "service-role" });
    expect(inputs.sessionLookup).not.toHaveBeenCalled();
  });

  it("allows the cron key when it is configured", async () => {
    const inputs = makeInputs({ authorizationHeader: "Bearer cron-key" });
    const result = await isRequestAuthorized(inputs);
    expect(result).toEqual({ allowed: true, kind: "cron" });
    expect(inputs.sessionLookup).not.toHaveBeenCalled();
  });

  it("does not treat an unconfigured cron key as valid (fails closed)", async () => {
    const inputs = makeInputs({
      cronApiKey: null,
      authorizationHeader: "Bearer cron-key",
      sessionLookup: vi.fn(async () => ({ status: "missing" })),
    });
    const result = await isRequestAuthorized(inputs);
    expect(result.allowed).toBe(false);
  });

  it("allows the frontend API key sent via the apikey header", async () => {
    const inputs = makeInputs({ apiKeyHeader: "frontend-key" });
    const result = await isRequestAuthorized(inputs);
    expect(result).toEqual({ allowed: true, kind: "frontend-api-key" });
  });

  it("allows the frontend API key sent as the Bearer credential", async () => {
    const inputs = makeInputs({ authorizationHeader: "Bearer frontend-key" });
    const result = await isRequestAuthorized(inputs);
    expect(result).toEqual({ allowed: true, kind: "frontend-api-key" });
  });

  it("trims and tolerates case differences in the Bearer prefix", async () => {
    const inputs = makeInputs({
      authorizationHeader: "bearer   service-role-key  ",
    });
    const result = await isRequestAuthorized(inputs);
    expect(result).toEqual({ allowed: true, kind: "service-role" });
  });
});

describe("createSessionLookup", () => {
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  function stubSupabase(maybeSingleResult: { data: unknown; error: unknown }) {
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      maybeSingle: vi.fn(() => Promise.resolve(maybeSingleResult)),
    };
    return {
      from: vi.fn(() => builder),
    };
  }

  function lookupResult(result: { data: unknown; error: unknown }): Promise<SessionLookupResult> {
    const supabase = stubSupabase(result);
    return createSessionLookup(supabase)("token");
  }

  it("returns valid for a session row that has not expired", async () => {
    const result = await lookupResult({ data: { id: "1", expires_at: future }, error: null });
    expect(result).toEqual({ status: "valid" });
  });

  it("returns expired for a session row whose expiry has passed", async () => {
    const result = await lookupResult({ data: { id: "1", expires_at: past }, error: null });
    expect(result).toEqual({ status: "expired" });
  });

  it("returns missing when no session row exists", async () => {
    const result = await lookupResult({ data: null, error: null });
    expect(result).toEqual({ status: "missing" });
  });

  it("returns error when the sessions query fails", async () => {
    const supabaseError = { message: "sessions table inaccessible" };
    const result = await lookupResult({ data: null, error: supabaseError });
    expect(result).toEqual({ status: "error", error: supabaseError });
  });

  it("returns missing when the token record has no expiry at all", async () => {
    const result = await lookupResult({ data: { id: "1", expires_at: null }, error: null });
    expect(result).toEqual({ status: "missing" });
  });
});