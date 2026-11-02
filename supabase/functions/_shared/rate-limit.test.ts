import { describe, it, expect } from "vitest";
import { consumeQuota, consumeRateLimit } from "./rate-limit";

type RpcResult = { data: unknown; error: unknown };

function fakeSupabase(result: RpcResult) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return result;
    },
  };
  return { client, calls };
}

const inAnHour = new Date(Date.now() + 60 * 60 * 1000).toISOString();

describe("consumeRateLimit", () => {
  it("counts an attempt inside the window in one call", async () => {
    const { client, calls } = fakeSupabase({
      data: [{ allowed: true, attempts: 2, reset_at: inAnHour }],
      error: null,
    });

    const result = await consumeRateLimit(client, "verify-license:ip:1.2.3.4", {
      max: 5,
      windowMinutes: 15,
    });

    expect(result).toEqual({ allowed: true, remaining: 3, resetAt: inAnHour });
    expect(calls).toEqual([
      {
        name: "consume_rate_limit",
        args: { p_key: "verify-license:ip:1.2.3.4", p_max: 5, p_window_minutes: 15 },
      },
    ]);
  });

  it("refuses once the window is used up", async () => {
    const { client } = fakeSupabase({
      data: [{ allowed: false, attempts: 6, reset_at: inAnHour }],
      error: null,
    });

    const result = await consumeRateLimit(client, "verify-license:ip:1.2.3.4");
    expect(result).toEqual({ allowed: false, resetAt: inAnHour });
  });

  it("refuses when the counter cannot be read", async () => {
    const { client } = fakeSupabase({ data: null, error: { message: "down" } });

    const result = await consumeRateLimit(client, "verify-license:ip:1.2.3.4");
    expect(result).toEqual({ allowed: false, resetAt: null });
  });

  it("refuses when the counter returns nothing", async () => {
    const { client } = fakeSupabase({ data: [], error: null });

    const result = await consumeRateLimit(client, "verify-license:ip:1.2.3.4");
    expect(result).toEqual({ allowed: false, resetAt: null });
  });
});

describe("consumeQuota", () => {
  it("namespaces the subject and passes the quota to one atomic call", async () => {
    const { client, calls } = fakeSupabase({
      data: [{ allowed: true, attempts: 1, reset_at: inAnHour }],
      error: null,
    });

    const result = await consumeQuota(client, "captions-chat", "user-1", 3, 60);
    expect(result.allowed).toBe(true);
    expect(calls).toEqual([
      {
        name: "consume_rate_limit",
        args: { p_key: "captions-chat:user-1", p_max: 3, p_window_minutes: 60 },
      },
    ]);
  });
});
