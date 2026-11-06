import { describe, it, expect } from "vitest";
import { instagramTokenRecord } from "./instagram-token.ts";

const AN_HOUR = 3600;
const TWO_MONTHS = 5184000;
const NOW = Date.parse("2026-11-06T10:00:00.000Z");

describe("instagramTokenRecord", () => {
  it("stores the renewed token when Meta answers the exchange", () => {
    const record = instagramTokenRecord(
      { access_token: "SHORT", expires_in: AN_HOUR },
      { access_token: "LONG", expires_in: TWO_MONTHS },
      NOW,
    );

    expect(record).toEqual({
      access_token: "LONG",
      token_expiry: new Date(NOW + TWO_MONTHS * 1000).toISOString(),
      token_source: "long_lived_exchange",
    });
  });

  it("stores the exchanged token when Meta refuses the renewal", () => {
    const record = instagramTokenRecord(
      { access_token: "SHORT", expires_in: AN_HOUR },
      null,
      NOW,
    );

    expect(record).toEqual({
      access_token: "SHORT",
      token_expiry: new Date(NOW + AN_HOUR * 1000).toISOString(),
      token_source: "authorization_code",
    });
  });

  it("leaves no deadline when Meta states no lifetime", () => {
    const record = instagramTokenRecord({ access_token: "SHORT" }, null, NOW);

    expect(record.token_expiry).toBeNull();
  });

  it("counts the lifetime it was given from the call time, not the clock it read", () => {
    const record = instagramTokenRecord(
      { access_token: "SHORT", expires_in: AN_HOUR },
      null,
      Date.parse("2026-11-06T10:00:00.500Z"),
    );

    expect(record.token_expiry).toBe("2026-11-06T11:00:00.500Z");
  });

  it("prefers a stated lifetime of zero over the token it replaced", () => {
    const record = instagramTokenRecord(
      { access_token: "SHORT", expires_in: AN_HOUR },
      { access_token: "LONG", expires_in: 0 },
      NOW,
    );

    expect(record.token_expiry).toBe(new Date(NOW).toISOString());
  });
});
