export type SupabaseConfig = {
  url: string;
  key: string;
  configured: boolean;
};

const PLACEHOLDER_URL = "https://not-configured.supabase.co";
const PLACEHOLDER_KEY = "not-configured";

/**
 * A build with empty VITE_ values still has to boot: the public landing page
 * does not talk to Supabase. Only calls that do will fail, on the placeholder
 * host, and the app shows a configuration notice.
 */
export function resolveSupabaseConfig(url?: string, key?: string): SupabaseConfig {
  const trimmedUrl = url?.trim() ?? "";
  const trimmedKey = key?.trim() ?? "";
  if (trimmedUrl && trimmedKey) {
    return { url: trimmedUrl, key: trimmedKey, configured: true };
  }
  return { url: PLACEHOLDER_URL, key: PLACEHOLDER_KEY, configured: false };
}
