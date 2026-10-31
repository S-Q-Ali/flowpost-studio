export type SessionLookupResult =
  | { status: "valid"; userId?: string | null }
  | { status: "expired" }
  | { status: "missing" }
  | { status: "error"; error?: unknown };

export type AuthResult =
  | { allowed: true; kind: "service-role" | "cron" | "frontend-api-key"; userId?: string | null }
  | { allowed: true; kind: "session"; userId: string }
  | {
      allowed: false;
      reason: string;
    };

export function resolveSessionOwner(
  auth: AuthResult | null,
  requestedUserId?: string | null,
): { userId: string | null; denied: boolean } {
  if (auth && auth.kind === "session") {
    // A session row without a user owns nothing; trusting the requested id
    // here is what let a null-user token act as any account.
    if (!auth.userId) return { userId: null, denied: true };
    if (requestedUserId && requestedUserId !== auth.userId) return { userId: null, denied: true };
    return { userId: auth.userId, denied: false };
  }
  return { userId: requestedUserId ?? null, denied: false };
}

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

export function bearerOf(header: string | null): string | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^Bearer(?:\s+(.*))?$/i);
  if (match) return match[1]?.trim() || null;
  return trimmed;
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
  if (lookup.status === "valid") {
    if (!lookup.userId) return { allowed: false, reason: "session-without-user" };
    return { allowed: true, kind: "session", userId: lookup.userId };
  }
  if (lookup.status === "expired") return { allowed: false, reason: "expired-session" };
  if (lookup.status === "error") return { allowed: false, reason: "session-lookup-error" };
  return { allowed: false, reason: "invalid-session" };
}

/**
 * Resolves a bearer to a user id.
 *
 * Operator sessions are one UUID pair stored in `sessions`; the web app signs
 * in with Supabase, so its access token is verified by the auth server and its
 * subject is the same `public.users.id` the RLS policies use.
 */
export function createSessionLookup(supabase: any) {
  return async (token: string): Promise<SessionLookupResult> => {
    const { data, error } = await supabase
      .from("sessions")
      .select("id, user_id, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (error) return { status: "error", error };
    if (data) {
      if (!data.expires_at) return { status: "missing" };
      if (new Date(data.expires_at).getTime() <= Date.now()) return { status: "expired" };
      return { status: "valid", userId: data.user_id };
    }

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser(token);
      if (authError) return { status: "error", error: authError };
      const userId = authData?.user?.id;
      return userId ? { status: "valid", userId } : { status: "missing" };
    } catch (err) {
      return { status: "error", error: err };
    }
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