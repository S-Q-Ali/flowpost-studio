import { decrypt } from "./crypto.ts";

/**
 * One place that answers "what does this deployment use for GROQ_API_KEY".
 *
 * The guided setup stores a value on the server; a deployment set before it
 * keeps its edge-function secrets. The stored value wins, the environment is
 * the fallback, and a name with neither is reported in words the user can act
 * on. Secrets are never logged and never returned to a caller.
 */

/** A value this server was asked for and cannot supply. */
export class SecretProblem extends Error {
  readonly names: string[];

  constructor(names: string[], message: string) {
    super(message);
    this.name = "SecretProblem";
    this.names = names;
  }
}

type EnvLookup = (name: string) => string | undefined;
type Unseal = (stored: string) => Promise<string>;

export interface SecretSources {
  /** Where to look after the server's own config. Defaults to the process env. */
  env?: EnvLookup;
  /** How a stored value is opened. Defaults to the token encryption key. */
  unseal?: Unseal;
}

const fromProcessEnv: EnvLookup = (name) => {
  const deno = (globalThis as {
    Deno?: { env?: { get(key: string): string | undefined } };
  }).Deno;
  return deno?.env?.get(name);
};

const unsealStored: Unseal = async (stored) => {
  const plain = await decrypt(stored);
  // crypto.decrypt answers with the input when nothing could open it.
  if (plain === stored) throw new Error("the stored value did not change");
  return plain;
};

export function secretNotSetMessage(names: string[]): string {
  return (
    `This server has no value for ${names.join(", ")}. Add it in the guided ` +
    "setup, or set it under Supabase → Edge Functions → Secrets."
  );
}

function secretUnreadableMessage(names: string[]): string {
  return (
    `This server cannot read the stored value for ${names.join(", ")}. ` +
    "TOKEN_ENCRYPTION_KEY may have changed since it was saved; set the value " +
    "again in the guided setup."
  );
}

async function storedValues(supabase: any, names: string[]): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  if (!supabase || names.length === 0) return found;
  const { data, error } = await supabase
    .from("operator_config")
    .select("name, value")
    .in("name", names);
  if (error) {
    // A deployment that still carries its secrets in the environment must not
    // lose them because one extra read failed.
    console.error("operator_config read failed", error);
    return found;
  }
  for (const row of (data ?? []) as { name?: unknown; value?: unknown }[]) {
    if (typeof row?.name === "string" && typeof row?.value === "string" && row.value) {
      found.set(row.name, row.value);
    }
  }
  return found;
}

/**
 * The values for these names, from the server's config or the environment.
 *
 * @throws SecretProblem naming what is missing, or what is stored but cannot
 * be opened. A stored value that will not open is reported rather than
 * silently replaced by the environment: two answers for one name is worse
 * than a failure the operator can see.
 */
export async function readSecrets(
  supabase: any,
  names: string[],
  sources: SecretSources = {},
): Promise<Record<string, string>> {
  const env = sources.env ?? fromProcessEnv;
  const unseal = sources.unseal ?? unsealStored;
  const stored = await storedValues(supabase, names);

  const values: Record<string, string> = {};
  const missing: string[] = [];
  const unreadable: string[] = [];

  for (const name of names) {
    const raw = stored.get(name);
    if (raw) {
      try {
        values[name] = await unseal(raw);
      } catch {
        unreadable.push(name);
      }
      continue;
    }
    const fromEnv = env(name)?.trim();
    if (fromEnv) values[name] = fromEnv;
    else missing.push(name);
  }

  if (unreadable.length) {
    throw new SecretProblem(unreadable, secretUnreadableMessage(unreadable));
  }
  if (missing.length) {
    throw new SecretProblem(missing, secretNotSetMessage(missing));
  }
  return values;
}

/** The one value a caller needs, or a SecretProblem telling where to set it. */
export async function readSecret(
  supabase: any,
  name: string,
  sources: SecretSources = {},
): Promise<string> {
  const values = await readSecrets(supabase, [name], sources);
  return values[name];
}
