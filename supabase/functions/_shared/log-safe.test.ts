import { describe, it, expect } from "vitest";
import { redactTokens } from "./log-safe";

describe("redactTokens", () => {
  it("keeps media proxy credentials out of the logs", () => {
    const text =
      'Unsupported URL "https://project.supabase.co/functions/v1/get-file?token=abc123%2Fdef"';
    expect(redactTokens(text)).toBe(
      'Unsupported URL "https://project.supabase.co/functions/v1/get-file?token=[redacted]"',
    );
  });

  it("replaces every token in a JSON body", () => {
    const text = JSON.stringify({
      error: { message: "failed", url: "https://x/get-file?token=one&size=2" },
      debug: "token=two",
    });
    expect(redactTokens(text)).toBe(
      '{"error":{"message":"failed","url":"https://x/get-file?token=[redacted]&size=2"},"debug":"token=[redacted]"}',
    );
  });

  it("redacts a platform access token too", () => {
    expect(redactTokens("Echos token=abc and access_token=def")).toBe(
      "Echos token=[redacted] and access_token=[redacted]",
    );
  });

  it("leaves text without a token as it is", () => {
    expect(redactTokens('{"id":"17840","status":"READY"}')).toBe('{"id":"17840","status":"READY"}');
    expect(redactTokens("?tokenized=false")).toBe("?tokenized=false");
  });
});
