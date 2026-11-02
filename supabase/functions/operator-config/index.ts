import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import { createRequestAuthorizer, createSessionLookup } from "../_shared/auth.ts";
import { encrypt } from "../_shared/crypto.ts";
import {
  configRejection,
  parseConfigWrite,
  resolveConfigCaller,
} from "../_shared/operator-config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://flowpost-studio.vercel.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const authorize = createRequestAuthorizer({
  serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
  cronApiKey: null,
  anonKey: SUPABASE_ANON_KEY,
  sessionLookup: createSessionLookup(supabase),
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const UNAUTHORISED: Record<number, string> = {
  401: "Sign in with the license key of this server first.",
  403: "Only the account that runs this server can store its keys.",
};

// Stores the keys the guided setup collects for the server. Names go in and
// names come back: a value is encrypted on the way in and never read out here.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const auth = await authorize(req);
    const caller = await resolveConfigCaller(supabase, auth);
    const rejection = configRejection(caller);
    if (rejection) return json({ error: UNAUTHORISED[rejection] }, rejection);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Send a JSON body with values." }, 400);
    }

    const parsed = parseConfigWrite(body);
    if (!parsed.ok) return json({ error: parsed.error }, parsed.status);

    const updatedBy = auth.allowed && auth.kind === "session" ? auth.userId : null;
    const rows: { name: string; value: string; updated_by: string | null }[] = [];
    try {
      for (const [name, value] of Object.entries(parsed.values)) {
        rows.push({ name, value: await encrypt(value), updated_by: updatedBy });
      }
    } catch {
      // Without the encryption key nothing may reach the table in the clear.
      return json(
        { error: "This server cannot encrypt values. Set TOKEN_ENCRYPTION_KEY and deploy again." },
        500,
      );
    }

    const { error } = await supabase
      .from("operator_config")
      .upsert(rows, { onConflict: "name" });
    if (error) {
      console.error("operator-config write failed", error);
      return json({ error: "The values could not be stored. Try again." }, 500);
    }

    return json({ saved: rows.map((row) => row.name) });
  } catch (err) {
    console.error("operator-config error", err);
    return json({ error: "The request could not be read." }, 400);
  }
});
