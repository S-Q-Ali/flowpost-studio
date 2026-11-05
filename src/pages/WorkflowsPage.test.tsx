import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import WorkflowsPage from "./WorkflowsPage";

const backend = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: backend }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ userId: "owner" }) }));

afterEach(() => { cleanup(); vi.resetAllMocks(); });

function showPage(history: { data: unknown; error: unknown }) {
  backend.from.mockImplementation((table) => {
    const query: any = {
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({
        data: table === "workflows" ? [{
          id: "wf-1", name: "Test workflow", user_id: "owner", platforms: [],
          is_active: true, media_type: "video", last_triggered_at: null,
          last_manual_triggered_at: null,
        }] : [],
        error: null,
      }).then(resolve),
    };
    for (const method of ["select", "eq", "order", "in"]) query[method] = () => query;
    return query;
  });
  backend.rpc.mockImplementation(() => {
    const result = Promise.resolve(history);
    return Object.assign(result, { abortSignal: () => result });
  });
  render(<MemoryRouter><WorkflowsPage /></MemoryRouter>);
}

describe("workflow card history", () => {
  it("does not nest a schedule block inside a paragraph", async () => {
    showPage({ data: [], error: null });
    await screen.findByText("Test workflow");
    expect(document.querySelector("p div")).toBeNull();
  });

  it("distinguishes a failed history read from a workflow that never ran", async () => {
    showPage({ data: null, error: { message: "history unavailable" } });
    expect(await screen.findByText("Run history unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Never")).not.toBeInTheDocument();
  });

  it("keeps the legacy fallback when the history query succeeds with no runs", async () => {
    showPage({ data: [], error: null });
    expect(await screen.findByText("Never")).toBeInTheDocument();
  });

  it("renders the full failure reason as visible text", async () => {
    const message = "The source could not be read. ".repeat(12).trim();
    showPage({ data: [{ workflow_id: "wf-1", started_at: new Date().toISOString(), triggered_by: "manual", status: "failed", rows_seen: 0, posts_created: 0, message }], error: null });
    const reason = await screen.findByText((text) => text.endsWith(message));
    expect(reason).toBeVisible();
    expect(reason).not.toHaveClass("truncate");
  });
});
