import { describe, it, expect } from "vitest";
import { checkPostAccess } from "./post-access";
import type { AuthResult } from "./auth";

const session = (userId: string): AuthResult => ({
  allowed: true,
  kind: "session",
  userId,
});

const serviceRole: AuthResult = { allowed: true, kind: "service-role" };

describe("checkPostAccess", () => {
  it("lets a session publish its own scheduled post", () => {
    const result = checkPostAccess(session("user-1"), {
      user_id: "user-1",
      status: "scheduled",
    });
    expect(result).toEqual({ ok: true });
  });

  it("refuses a session touching another user's post", () => {
    const result = checkPostAccess(session("user-1"), {
      user_id: "user-2",
      status: "scheduled",
    });
    expect(result).toEqual({
      ok: false,
      status: 403,
      error: "Post belongs to another user",
    });
  });

  it("refuses a post that is already published", () => {
    const result = checkPostAccess(serviceRole, {
      user_id: "user-1",
      status: "published",
    });
    expect(result).toEqual({
      ok: false,
      status: 409,
      error: "Post is already published",
    });
  });

  it("lets the scheduler publish a processing post", () => {
    const result = checkPostAccess(serviceRole, {
      user_id: "user-1",
      status: "processing",
    });
    expect(result).toEqual({ ok: true });
  });

  it("trusts a service-role caller for any owner", () => {
    const result = checkPostAccess(serviceRole, {
      user_id: "user-9",
      status: "scheduled",
    });
    expect(result).toEqual({ ok: true });
  });
});
