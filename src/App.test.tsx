import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AppRoutes } from "./App";

vi.mock("./lib/desktop-download", async () => {
  const actual = await vi.importActual<typeof import("./lib/desktop-download")>(
    "./lib/desktop-download",
  );
  return {
    ...actual,
    fetchReleaseStatus: vi.fn().mockResolvedValue({ state: "loading" }),
  };
});

afterEach(cleanup);

function visitRoute(path: string) {
  return render(
    <ThemeProvider attribute="class" defaultTheme="light" disableTransitionOnChange>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe("AppRoutes web shutdown behavior", () => {
  it("keeps the desktop landing page live on / and redirects /pipeline to /", async () => {
    visitRoute("/");
    expect(
      await screen.findByRole("link", { name: /get the windows build/i }),
    ).toBeInTheDocument();

    cleanup();
    visitRoute("/pipeline");
    expect(
      await screen.findByRole("link", { name: /get the windows build/i }),
    ).toBeInTheDocument();
  });

  it("keeps /connect-done live for desktop OAuth handoffs", async () => {
    visitRoute("/connect-done");
    expect(
      await screen.findByRole("heading", { level: 1, name: /not valid/i }),
    ).toBeInTheDocument();
  });

  it("keeps /terms and /privacy live and links their logo home", async () => {
    visitRoute("/terms");
    expect(
      await screen.findByRole("heading", { level: 1, name: /terms of service/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /flowpost studio/i })).toHaveAttribute("href", "/");

    cleanup();
    visitRoute("/privacy");
    expect(
      await screen.findByRole("heading", { level: 1, name: /privacy policy/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /flowpost studio/i })).toHaveAttribute("href", "/");
  });

  it.each([
    "/login",
    "/auth/callback",
    "/security-questions",
    "/dashboard",
    "/upload",
    "/workflows",
    "/workflows/123/items",
    "/calendar",
    "/queue",
    "/accounts",
    "/storage",
    "/insights",
    "/tools",
    "/profile",
  ])("shows the web app shutdown notice on retired route %s", async (path) => {
    visitRoute(path);
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: /flowpost web app has shut down/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /download flowpost desktop/i }),
    ).toHaveAttribute("href", "/#desktop");
  });

  it("shows 404 on unknown routes", async () => {
    visitRoute("/does-not-exist");
    expect(
      await screen.findByRole("heading", { level: 1, name: "404" }),
    ).toBeInTheDocument();
  });
});
