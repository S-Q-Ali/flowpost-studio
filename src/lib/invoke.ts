export function getSessionToken(): string | null {
  return localStorage.getItem("flowpost_token");
}

export interface InvokeFunctionOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export class InvokeFunctionError extends Error {
  status?: number;
  context?: unknown;

  constructor(message: string, opts: { status?: number; context?: unknown } = {}) {
    super(message);
    this.name = "InvokeFunctionError";
    this.status = opts.status;
    this.context = opts.context;
  }
}

export interface InvokeFunctionResult<T> {
  data: T | null;
  error: InvokeFunctionError | null;
}

function stringifyBody(body: unknown): string | FormData | undefined {
  if (body === undefined || body === null) return undefined;
  if (typeof body === "string") return body;
  if (body instanceof FormData) return body;
  return JSON.stringify(body);
}

export async function invokeFunction<T = any>(
  functionRef: string,
  options: InvokeFunctionOptions = {},
): Promise<InvokeFunctionResult<T>> {
  const { method = "POST", body, headers = {}, signal } = options;

  const parsedBody = stringifyBody(body);
  const outHeaders: Record<string, string> = {};
  const token = getSessionToken();
  if (token) outHeaders.Authorization = `Bearer ${token}`;
  if (parsedBody !== undefined && !(parsedBody instanceof FormData)) {
    outHeaders["Content-Type"] = "application/json";
  }
  Object.assign(outHeaders, headers);

  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || "";
  let res: Response;
  try {
    res = await fetch(`${supabaseUrl}/functions/v1/${functionRef}`, {
      method,
      headers: outHeaders,
      body: parsedBody as BodyInit | undefined,
      signal,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { data: null, error: new InvokeFunctionError(message) };
  }

  let bodyText = "";
  try {
    bodyText = await res.text();
  } catch {
    bodyText = "";
  }

  let parsed: unknown = null;
  if (bodyText) {
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      parsed = null;
    }
  }

  if (res.ok) {
    return { data: parsed as T, error: null };
  }

  const context = parsed && typeof parsed === "object" ? parsed : undefined;
  const serverMessage =
    context && typeof context === "object" && "error" in context
      ? String((context as { error: unknown }).error)
      : "";
  const message =
    serverMessage || `Edge Function returned a non-2xx status code: ${res.status}`;

  return { data: null, error: new InvokeFunctionError(message, { status: res.status, context }) };
}