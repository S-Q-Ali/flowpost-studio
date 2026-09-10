export type SessionLookupResult =
  | { status: "valid" }
  | { status: "expired" }
  | { status: "missing" }
  | { status: "error"; error?: unknown };

export type AuthResult =
  | { allowed: true; kind: "service-role" | "cron" | "frontend-api-key" | "session" }
  | {
      allowed: false;
      reason:
        | "no-credentials"
        | "anon-key"
        | "expired-session"
        | "invalid-session"
        | "session-lookup-error";
    };

export interface AuthInputs {
  authorizationHeader: string | null;
  adminTokenHeader: string | null;
  apiKeyHeader: string | null;
  serviceRoleKey: string | null;
  cronApiKey: string | null;
  frontendApiKey: string | null;
  anonKey: string | null;
  sessionLookup: (token: string) => Promise<SessionLookupResult>;
}

function bearerOf(header: string | null): string | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^Bearer\s+(.+)$/i);
  return (match ? match[1] : trimmed).trim();
}

export async function isRequestAuthorized(inputs: AuthInputs): Promise<AuthResult> {
  const bearer = bearerOf(inputs.authorizationHeader);
  const adminToken = inputs.adminTokenHeader?.trim() || null;
  const apiKey = inputs.apiKeyHeader?.trim() || null;

  if (inputs.anonKey && (bearer === inputs.anonKey || adminToken === inputs.anonKey)) {
    return { allowed: false, reason: "anon-key" };
  }

  if (inputs.serviceRoleKey && bearer === inputs.serviceRoleKey) {
    return { allowed: true, kind: "service-role" };
  }

  if (inputs.cronApiKey && bearer === inputs.cronApiKey) {
    return { allowed: true, kind: "cron" };
  }

  if (inputs.frontendApiKey && (bearer === inputs.frontendApiKey || apiKey === inputs.frontendApiKey)) {
    return { allowed: true, kind: "frontend-api-key" };
  }

  const sessionCandidate = adminToken || bearer;
  if (!sessionCandidate) {
    return { allowed: false, reason: "no-credentials" };
  }

  const lookup = await inputs.sessionLookup(sessionCandidate);
  if (lookup.status === "valid") return { allowed: true, kind: "session" };
  if (lookup.status === "expired") return { allowed: false, reason: "expired-session" };
  if (lookup.status === "error") return { allowed: false, reason: "session-lookup-error" };
  return { allowed: false, reason: "invalid-session" };
}

export function createSessionLookup(supabase: any) {
  return async (token: string): Promise<SessionLookupResult> => {
    const { data, error } = await supabase
      .from("sessions")
      .select("id, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (error) return { status: "error", error };
    if (!data || !data.expires_at) return { status: "missing" };
    if (new Date(data.expires_at).getTime() <= Date.now()) return { status: "expired" };
    return { status: "valid" };
  };
}

export interface RequestAuthorizerDeps {
  serviceRoleKey: string | null;
  cronApiKey: string | null;
  frontendApiKey: string | null;
  anonKey: string | null;
  sessionLookup: (token: string) => Promise<SessionLookupResult>;
}

export type RequestAuthorizer = (req: RequestLike) => Promise<AuthResult>;

export interface RequestLike {
  headers: { get(name: string): string | null };
}

export function createRequestAuthorizer(deps: RequestAuthorizerDeps): RequestAuthorizer {
  return (req: RequestLike): Promise<AuthResult> =>
    isRequestAuthorized({
      authorizationHeader: req.headers.get("Authorization"),
      adminTokenHeader: req.headers.get("x-admin-token"),
      apiKeyHeader: req.headers.get("apikey"),
      serviceRoleKey: deps.serviceRoleKey,
      cronApiKey: deps.cronApiKey,
      frontendApiKey: deps.frontendApiKey,
      anonKey: deps.anonKey,
      sessionLookup: deps.sessionLookup,
    });
}