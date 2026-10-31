import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthContext";
import { supabase } from "@/integrations/supabase/client";

type AuthEvent = "INITIAL_SESSION" | "SIGNED_IN" | "SIGNED_OUT";
type AuthSession = { user: { id: string } } | null;

const { listeners } = vi.hoisted(() => ({
  listeners: [] as Array<(event: AuthEvent, session: AuthSession) => void>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: (event: AuthEvent, session: AuthSession) => void) => {
        listeners.push(cb);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
      signOut: vi.fn().mockResolvedValue({ error: null }),
      startAutoRefresh: vi.fn(),
      signInWithPassword: vi.fn(),
      signInWithOAuth: vi.fn(),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { id: "user-1", is_admin: false }, error: null }),
        }),
      }),
    }),
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
  },
}));

function Probe() {
  const { isAuthenticated, isVerifying } = useAuth();
  return (
    <span data-testid="state">
      {isVerifying ? "verifying" : isAuthenticated ? "in" : "out"}
    </span>
  );
}

function LogoutButton() {
  const { logout } = useAuth();
  return <button onClick={() => void logout()}>lock</button>;
}

describe("AuthProvider", () => {
  beforeEach(() => {
    listeners.length = 0;
    sessionStorage.clear();
    localStorage.clear();
  });

  it("restores a persisted Supabase session on startup", async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    // The provider must subscribe, otherwise Supabase can never restore the
    // session it persisted in localStorage and every launch shows the login page.
    expect(listeners).toHaveLength(1);

    await act(async () => {
      listeners[0]("INITIAL_SESSION", { user: { id: "user-1" } });
    });

    expect(screen.getByTestId("state")).toHaveTextContent("in");
  });

  it("revokes the operator token on logout instead of only forgetting it", async () => {
    localStorage.setItem("flowpost_token", "tok-operator");
    render(
      <AuthProvider>
        <LogoutButton />
      </AuthProvider>,
    );

    await act(async () => {
      screen.getByRole("button", { name: "lock" }).click();
    });

    expect(localStorage.getItem("flowpost_token")).toBeNull();
    expect(supabase.functions.invoke).toHaveBeenCalledWith("verify-session", {
      body: { token: "tok-operator", action: "revoke" },
    });
    expect(supabase.auth.signOut).toHaveBeenCalled();
  });
});
