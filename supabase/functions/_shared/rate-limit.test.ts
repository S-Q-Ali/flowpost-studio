import { describe, it, expect } from "vitest";
import { consumeQuota } from "./rate-limit";

type Row = { attempts: number; reset_at: string } | null;

function fakeSupabase(row: Row) {
  const writes: { op: string; payload: unknown }[] = [];
  const client = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: row, error: null }),
        }),
      }),
      update: (payload: unknown) => {
        writes.push({ op: "update", payload });
        return { eq: async () => ({ error: null }) };
      },
      insert: async (payload: unknown) => {
        writes.push({ op: "insert", payload });
        return { error: null };
      },
    }),
  };
  return { client, writes };
}

const inAnHour = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const anHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

describe("consumeQuota", () => {
  it("starts a new window when the subject has no counter", async () => {
    const { client, writes } = fakeSupabase(null);
    const result = await consumeQuota(client, "captions-chat", "user-1", 3, 60);
    expect(result.allowed).toBe(true);
    expect(writes).toEqual([
      {
        op: "insert",
        payload: { key: "captions-chat:user-1", attempts: 1, reset_at: result.resetAt },
      },
    ]);
  });

  it("counts a call inside the window", async () => {
    const { client, writes } = fakeSupabase({ attempts: 1, reset_at: inAnHour });
    const result = await consumeQuota(client, "captions-chat", "user-1", 3, 60);
    expect(result.allowed).toBe(true);
    expect(writes).toEqual([{ op: "update", payload: { attempts: 2 } }]);
  });

  it("refuses once the window is used up and does not write", async () => {
    const { client, writes } = fakeSupabase({ attempts: 3, reset_at: inAnHour });
    const result = await consumeQuota(client, "captions-chat", "user-1", 3, 60);
    expect(result.allowed).toBe(false);
    expect(writes).toEqual([]);
  });

  it("starts over when the stored window has passed", async () => {
    const { client, writes } = fakeSupabase({ attempts: 3, reset_at: anHourAgo });
    const result = await consumeQuota(client, "captions-chat", "user-1", 3, 60);
    expect(result.allowed).toBe(true);
    expect(writes).toEqual([
      {
        op: "update",
        payload: { attempts: 1, reset_at: result.resetAt },
      },
    ]);
  });
});
