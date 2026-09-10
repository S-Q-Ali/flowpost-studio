import { describe, it, expect } from "vitest";
import { sanitizeChatOptions, ALLOWED_CHAT_MODELS, MAX_CHAT_TOKENS } from "./groq";

const allowedModel = Array.from(ALLOWED_CHAT_MODELS)[0];

describe("sanitizeChatOptions", () => {
  it("accepts a request with an allowed model and messages", () => {
    const result = sanitizeChatOptions({ model: allowedModel, messages: [{ role: "user", content: "hi" }] });
    expect(result).toEqual({
      ok: true,
      model: allowedModel,
      messages: [{ role: "user", content: "hi" }],
      temperature: undefined,
      max_tokens: 1024,
    });
  });

  it("rejects a model that is not on the allowlist", () => {
    const result = sanitizeChatOptions({ model: "meta-llama/llama-1330b", messages: [{ role: "user", content: "x" }] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/not allowed/i);
  });

  it("rejects a request with no model", () => {
    const result = sanitizeChatOptions({ messages: [{ role: "user", content: "x" }] });
    expect(result.ok).toBe(false);
  });

  it("rejects a request with no messages", () => {
    const result = sanitizeChatOptions({ model: allowedModel });
    expect(result).toEqual({ ok: false, reason: "messages must be a non-empty array" });
  });

  it("rejects an empty messages array", () => {
    const result = sanitizeChatOptions({ model: allowedModel, messages: [] });
    expect(result).toEqual({ ok: false, reason: "messages must be a non-empty array" });
  });

  it("rejects messages that are not an array", () => {
    const result = sanitizeChatOptions({ model: allowedModel, messages: "nope" });
    expect(result).toEqual({ ok: false, reason: "messages must be a non-empty array" });
  });

  it("caps max_tokens at the configured ceiling", () => {
    const result = sanitizeChatOptions({
      model: allowedModel,
      messages: [{ role: "user", content: "x" }],
      max_tokens: 999999,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.max_tokens).toBe(MAX_CHAT_TOKENS);
  });

  it("passes through max_tokens that is under the ceiling", () => {
    const result = sanitizeChatOptions({
      model: allowedModel,
      messages: [{ role: "user", content: "x" }],
      max_tokens: 512,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.max_tokens).toBe(512);
  });

  it("passes through a numeric temperature", () => {
    const result = sanitizeChatOptions({
      model: allowedModel,
      messages: [{ role: "user", content: "x" }],
      temperature: 0.6,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.temperature).toBe(0.6);
  });

  it("rejects a non-numeric max_tokens", () => {
    const result = sanitizeChatOptions({
      model: allowedModel,
      messages: [{ role: "user", content: "x" }],
      max_tokens: "lots",
    });
    expect(result).toEqual({ ok: false, reason: "max_tokens must be a number" });
  });

  it("rejects non-object input", () => {
    const result = sanitizeChatOptions("just a string");
    expect(result.ok).toBe(false);
  });

  it("normalizes an allowed model that has surrounding whitespace", () => {
    const result = sanitizeChatOptions({ model: `  ${allowedModel}  `, messages: [{ role: "user", content: "x" }] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.model).toBe(allowedModel);
  });
});