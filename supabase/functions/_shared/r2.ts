import { readSecrets, type SecretSources } from "./secrets.ts";

/**
 * The R2 bucket this deployment uses, from the guided setup when a value is
 * stored there and from the edge-function secrets otherwise. Read per request
 * so a key saved in the wizard is used by the very next call.
 */
export const R2_SECRET_NAMES = [
  "R2_ENDPOINT",
  "R2_ACCESS_KEY",
  "R2_SECRET_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_URL",
] as const;

export interface R2Config {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  publicUrl: string;
}

/** @throws SecretProblem naming what is missing or stored but unreadable. */
export async function readR2Config(
  supabase: any,
  sources: SecretSources = {},
): Promise<R2Config> {
  const values = await readSecrets(supabase, [...R2_SECRET_NAMES], sources);
  return {
    endpoint: values.R2_ENDPOINT,
    accessKey: values.R2_ACCESS_KEY,
    secretKey: values.R2_SECRET_KEY,
    bucket: values.R2_BUCKET,
    publicUrl: values.R2_PUBLIC_URL,
  };
}