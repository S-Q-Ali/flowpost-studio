/**
 * The server's own keys, read and written through the edge functions.
 *
 * The guided setup on the desktop asks an operator for these so that a
 * deployment needs no CLI. Everything that matters lives here: which names are
 * storable, what a value may look like, who may change them, and the shape of
 * the answer — which carries names and booleans only, never a value.
 *
 * The wizard's copy of the name list is in
 * `desktop-flutter/lib/features/setup/domain/setup_steps.dart`. It is a client
 * convenience; this list is the one the server trusts.
 */

import type { AuthResult } from "./auth.ts";

export const OPERATOR_CONFIG_NAMES = [
  "GROQ_API_KEY",
  "R2_ENDPOINT",
  "R2_ACCESS_KEY",
  "R2_SECRET_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_URL",
  "YT_CLIENT_ID",
  "YT_CLIENT_SECRET",
  "GD_CLIENT_ID",
  "GD_CLIENT_SECRET",
  "IG_APP_ID",
  "IG_APP_SECRET",
  "FB_APP_ID",
  "FB_APP_SECRET",
  "TIKTOK_CLIENT_KEY",
  "TIKTOK_CLIENT_SECRET",
  "LINKEDIN_CLIENT_ID",
  "LINKEDIN_CLIENT_SECRET",
] as const;

export type OperatorConfigName = typeof OPERATOR_CONFIG_NAMES[number];

/** A credential is a token or a key id; nothing here needs to be longer. */
export const MAX_CONFIG_VALUE_LENGTH = 4096;

const NAME_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/;
const allowed = new Set<string>(OPERATOR_CONFIG_NAMES);

export type ConfigWriteResult =
  | { ok: true; values: Record<string, string> }
  | { ok: false; error: string; status: number };

function refused(error: string): ConfigWriteResult {
  return { ok: false, error, status: 400 };
}

/**
 * The names and values from a write request, or the one thing wrong with it.
 *
 * Values are trimmed but otherwise untouched: the function that stores them
 * encrypts, and the caller never gets one back.
 */
export function parseConfigWrite(body: unknown): ConfigWriteResult {
  if (typeof body !== "object" || body === null) return refused("Send a JSON body with values.");
  const raw = (body as { values?: unknown }).values;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return refused("Send an object of values to store.");
  }

  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length === 0) return refused("There is nothing to store.");

  const values: Record<string, string> = {};
  for (const [name, value] of entries) {
    if (!NAME_PATTERN.test(name) || !allowed.has(name)) {
      // The name is public knowledge; the value never appears in a refusal.
      return refused(`${name || "(empty)"} is not a value this app stores.`);
    }
    if (typeof value !== "string") return refused(`${name} must be a text value.`);
    const trimmed = value.trim();
    if (trimmed.length === 0) return refused(`${name} has no value.`);
    if (trimmed.length > MAX_CONFIG_VALUE_LENGTH) {
      return refused(`${name} is too long.`);
    }
    // One credential per name: a line break means the payload is not what it
    // claims, and a control character would travel into every later request.
    if (/[\u0000-\u001f\u007f]/.test(trimmed)) return refused(`${name} has an unusable character.`);
    values[name] = trimmed;
  }

  return { ok: true, values };
}

/** The names a row set carries, with none of the stored values. */
export function presentConfigNames(rows: unknown): string[] {
  if (!Array.isArray(rows)) return [];
  const names: string[] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const name = (row as { name?: unknown }).name;
    if (typeof name === "string" && allowed.has(name) && !names.includes(name)) {
      names.push(name);
    }
  }
  return names;
}

/**
 * True for the names that hold a value, false for the rest.
 *
 * Every allowed name is answered, so the wizard can mark a step ready without
 * carrying its own copy of what the server knows.
 */
export function configStatusValues(present: string[]): Record<string, boolean> {
  const has = new Set(present);
  const values: Record<string, boolean> = {};
  for (const name of OPERATOR_CONFIG_NAMES) values[name] = has.has(name);
  return values;
}

export interface ConfigCaller {
  kind: "service-role" | "cron" | "session";
  /** Whether the caller runs this server, as read from `public.users`. */
  isAdmin: boolean;
}

/** The status to answer a caller with, or null when they may go on. */
export function configRejection(caller: ConfigCaller | null): number | null {
  if (!caller) return 401;
  if (caller.kind === "service-role") return null;
  // A scheduler identity owns nothing, and a licensed user who does not run
  // this server cannot be allowed to point it at someone else's keys.
  if (caller.kind === "cron") return 403;
  return caller.isAdmin ? null : 403;
}

/** Whether this account is the one that runs the server. */
export async function isOperatorUser(supabase: any, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const { data, error } = await supabase
    .from("users")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();
  // A read that failed is answered as "not the operator", never as a pass.
  return !error && data?.is_admin === true;
}

/**
 * The caller behind a request, resolved against the users table when it is a
 * session. Null when the bearer is nothing this function can act for.
 */
export async function resolveConfigCaller(
  supabase: any,
  auth: AuthResult,
): Promise<ConfigCaller | null> {
  if (!auth.allowed) return null;
  if (auth.kind === "session") {
    return { kind: "session", isAdmin: await isOperatorUser(supabase, auth.userId) };
  }
  return { kind: auth.kind, isAdmin: false };
}

