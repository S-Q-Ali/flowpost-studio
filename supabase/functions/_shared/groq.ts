export const ALLOWED_CHAT_MODELS = new Set<string>([
  "openai/gpt-oss-120b",
  "qwen/qwen3.6-27b",
]);
export const MAX_CHAT_TOKENS = 8192;
export const DEFAULT_CHAT_TOKENS = 1024;

export type SanitizedChatOptions =
  | {
      ok: true;
      model: string;
      messages: unknown[];
      temperature: number | undefined;
      max_tokens: number;
    }
  | { ok: false; reason: string };

export function sanitizeChatOptions(input: unknown): SanitizedChatOptions {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, reason: "request body must be an object" };
  }
  const body = input as Record<string, unknown>;

  if (typeof body.model !== "string" || !body.model.trim()) {
    return { ok: false, reason: "model is required" };
  }
  const model = body.model.trim();
  if (!ALLOWED_CHAT_MODELS.has(model)) {
    return { ok: false, reason: `model '${model}' is not allowed` };
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return { ok: false, reason: "messages must be a non-empty array" };
  }

  const temperature =
    typeof body.temperature === "number" && Number.isFinite(body.temperature)
      ? body.temperature
      : undefined;

  if (
    body.max_tokens !== undefined &&
    (typeof body.max_tokens !== "number" || !Number.isFinite(body.max_tokens))
  ) {
    return { ok: false, reason: "max_tokens must be a number" };
  }

  const requested = typeof body.max_tokens === "number"
    ? Math.floor(body.max_tokens)
    : DEFAULT_CHAT_TOKENS;
  const max_tokens = Math.min(Math.max(requested, 1), MAX_CHAT_TOKENS);

  return { ok: true, model, messages: body.messages, temperature, max_tokens };
}