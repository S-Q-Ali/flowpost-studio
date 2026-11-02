import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import { createRequestAuthorizer, createSessionLookup } from "../_shared/auth.ts";
import {
  configRejection,
  configStatusValues,
  OPERATOR_CONFIG_NAMES,
  presentConfigNames,
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
  403: "Only the account that runs this server can read its configuration.",
};

// Answers which of the server's own keys hold a value. The reply is one boolean
// per name and nothing else, so the guided setup can mark a step ready without
// a stored credential ever crossing the wire.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST" && req.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const caller = await resolveConfigCaller(supabase, await authorize(req));
    const rejection = configRejection(caller);
    if (rejection) return json({ error: UNAUTHORISED[rejection] }, rejection);

    const { data, error } = await supabase
      .from("operator_config")
      .select("name")
      .in("name", [...OPERATOR_CONFIG_NAMES]);
    if (error) {
      console.error("config-status read failed", error);
      return json({ error: "The server could not read its own configuration." }, 500);
    }

    return json({ values: configStatusValues(presentConfigNames(data)) });
  } catch (err) {
    console.error("config-status error", err);
    return json({ error: "The request could not be read." }, 400);
  }
});
