import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSessionToken, invokeFunction } from "./invoke";

const SUPABASE_URL = "https://ximorwzknbizpceaoflw.supabase.co";

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.stubEnv("VITE_SUPABASE_URL", SUPABASE_URL);
  vi.stubGlobal("fetch", fetchMock);
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("invokeFunction", () => {
  it("attaches the session token as Authorization bearer when present", async () => {
    localStorage.setItem("flowpost_token", "session-tok-123");
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

    await invokeFunction("get-quota-usage", { body: { platform: "youtube" } });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer session-tok-123");
  });

  it("sends no Authorization header when no session token is present", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

    await invokeFunction("get-quota-usage", { body: { platform: "youtube" } });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
  });

  it("never sends the anon apikey header", async () => {
    localStorage.setItem("flowpost_token", "session-tok-123");
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

    await invokeFunction("transfer-ticket");

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.apikey).toBeUndefined();
  });

  it("builds the edge function URL from function ref", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

    await invokeFunction("get-quota-usage");

    expect(fetchMock.mock.calls[0][0]).toBe(`${SUPABASE_URL}/functions/v1/get-quota-usage`);
  });

  it("preserves query strings in the function ref", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ url: "https://oauth/start" }));

    await invokeFunction("facebook-auth?action=url&userId=u1", { method: "GET" });

    expect(fetchMock.mock.calls[0][0]).toBe(`${SUPABASE_URL}/functions/v1/facebook-auth?action=url&userId=u1`);
  });

  it("stringifies object bodies and sets Content-Type", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

    await invokeFunction("google-drive-auth", {
      body: { action: "list-files", account_id: "a1" },
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.body).toBe(JSON.stringify({ action: "list-files", account_id: "a1" }));
    expect(init.headers["Content-Type"]).toBe("application/json");
  });

  it("passes string bodies through untouched", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    const raw = JSON.stringify({ postId: "p1" });

    await invokeFunction("youtube-upload", { body: raw });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.body).toBe(raw);
  });

  it("merges caller-supplied headers (e.g. x-admin-token)", async () => {
    localStorage.setItem("flowpost_token", "session-tok-123");
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

    await invokeFunction("process-workflow", {
      body: { workflowId: "w1" },
      headers: { "x-admin-token": "session-tok-123" },
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["x-admin-token"]).toBe("session-tok-123");
    expect(init.headers.Authorization).toBe("Bearer session-tok-123");
  });

  it("returns parsed data with no error on 2xx", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ used: 3, percentage: 30 }));

    const { data, error } = await invokeFunction<{ used: number; percentage: number }>("get-quota-usage");

    expect(error).toBeNull();
    expect(data).toEqual({ used: 3, percentage: 30 });
  });

  it("surfaces body.error on non-2xx responses", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "quota check failed" }, 401));

    const { data, error } = await invokeFunction("get-quota-usage");

    expect(data).toBeNull();
    expect(error?.message).toBe("quota check failed");
    expect(error?.status).toBe(401);
  });

  it("falls back to an HTTP status message when body has no error", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 500 }));

    const { error } = await invokeFunction("get-quota-usage");

    expect(error?.status).toBe(500);
    expect(error?.message).toMatch(/500/);
  });

  it("returns a descriptive error on network failure", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const { data, error } = await invokeFunction("get-quota-usage");

    expect(data).toBeNull();
    expect(error?.message).toMatch(/Failed to fetch/);
  });

  it("defaults to POST", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

    await invokeFunction("mega-auth", { body: { action: "quota", account_id: "m1" } });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("POST");
  });

  it("honours an explicit GET method", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ url: "https://oauth/start" }));

    await invokeFunction("youtube-auth?action=url&userId=u1", { method: "GET" });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("GET");
  });

  it("forwards an abort signal", async () => {
    const controller = new AbortController();
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

    await invokeFunction("generate-ai-captions", {
      body: { mode: "groq-chat" },
      signal: controller.signal,
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.signal).toBe(controller.signal);
  });
});

describe("getSessionToken", () => {
  it("reads the token from localStorage", () => {
    localStorage.setItem("flowpost_token", "tok-abc");
    expect(getSessionToken()).toBe("tok-abc");
  });

  it("returns null when no token is stored", () => {
    expect(getSessionToken()).toBeNull();
  });
});