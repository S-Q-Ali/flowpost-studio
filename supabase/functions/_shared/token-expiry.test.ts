import { describe, expect, it } from "vitest";
import { hasExpired } from "./token-expiry";

const NOW = new Date("2026-11-07T12:00:00Z");

describe("hasExpired", () => {
  it("says a token is live when the row states no deadline", () => {
    // A Facebook Page token is issued without one, so a blank column must not
    // read as expired and refuse a post that would work.
    expect(hasExpired(null, NOW)).toBe(false);
  });

  it("says a token is live before its deadline", () => {
    expect(hasExpired("2026-11-07T12:00:01Z", NOW)).toBe(false);
  });

  it("says a token has expired once its deadline passes", () => {
    expect(hasExpired("2026-11-07T11:59:59Z", NOW)).toBe(true);
  });

  it("says a token has expired at the deadline itself", () => {
    expect(hasExpired("2026-11-07T12:00:00Z", NOW)).toBe(true);
  });

  it("says a token is live when the deadline is not an instant", () => {
    expect(hasExpired("not a date", NOW)).toBe(false);
  });
});
