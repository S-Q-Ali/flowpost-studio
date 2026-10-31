import { bearerOf } from "./auth.ts";

export interface AdminCallerDeps {
  resolveUserId(token: string): Promise<{ userId: string | null; error?: unknown }>;
  isAdmin(userId: string): Promise<{ admin: boolean; error?: unknown }>;
}

export type AdminCallerResult =
  | { allowed: true; userId: string }
  | {
      allowed: false;
      status: 401 | 500;
      reason: "missing-token" | "invalid-token" | "not-admin" | "lookup-error";
    };

export async function requireAdminCaller(
  authorizationHeader: string | null,
  deps: AdminCallerDeps,
): Promise<AdminCallerResult> {
  const token = bearerOf(authorizationHeader);
  if (!token) return { allowed: false, status: 401, reason: "missing-token" };

  const { userId, error } = await deps.resolveUserId(token);
  if (error || !userId) return { allowed: false, status: 401, reason: "invalid-token" };

  const admin = await deps.isAdmin(userId);
  if (admin.error) return { allowed: false, status: 500, reason: "lookup-error" };
  if (!admin.admin) return { allowed: false, status: 401, reason: "not-admin" };

  return { allowed: true, userId };
}
