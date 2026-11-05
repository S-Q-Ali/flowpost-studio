import { describe, it, expect, vi } from "vitest";
import { closeWorkflowRun, describeRun, openWorkflowRun } from "./workflow-runs.ts";

function makeSupabase(handlers: {
  insertResult?: { data: unknown; error: unknown };
  insertThrows?: boolean;
  updateThrows?: boolean;
}) {
  const inserted: unknown[] = [];
  const updates: unknown[] = [];
  const filters: string[] = [];
  const builder: any = {
    from() {
      return {
        insert(payload: unknown) {
          if (handlers.insertThrows) throw new Error("network down");
          inserted.push(payload);
          return {
            select() {
              return {
                single: () =>
                  Promise.resolve(handlers.insertResult ?? { data: { id: "run-1" }, error: null }),
              };
            },
          };
        },
        update(payload: unknown) {
          if (handlers.updateThrows) throw new Error("network down");
          updates.push(payload);
          return {
            eq(column: string, value: unknown) {
              filters.push(`${column}=${value}`);
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };
  return { supabase: builder, inserted, updates, filters };
}

describe("openWorkflowRun", () => {
  it("records the run and hands back its id", async () => {
    const { supabase, inserted } = makeSupabase({});

    const id = await openWorkflowRun(supabase, { workflowId: "wf-1", triggeredBy: "cron" });

    expect(id).toBe("run-1");
    expect(inserted).toEqual([{ workflow_id: "wf-1", triggered_by: "cron" }]);
  });

  it("says there is nothing to close when the insert is refused", async () => {
    const { supabase } = makeSupabase({
      insertResult: { data: null, error: { message: "permission denied" } },
    });

    await expect(
      openWorkflowRun(supabase, { workflowId: "wf-1", triggeredBy: "manual" }),
    ).resolves.toBeNull();
  });

  it("says there is nothing to close when the client throws", async () => {
    const { supabase } = makeSupabase({ insertThrows: true });

    await expect(
      openWorkflowRun(supabase, { workflowId: "wf-1", triggeredBy: "cron" }),
    ).resolves.toBeNull();
  });
});

describe("describeRun", () => {
  it("calls a body that reached its counters completed, complaints and all", () => {
    const run = describeRun({ rows: 4, posts: 1 }, ["Failed to update stats for wf-1"]);

    expect(run).toEqual({
      status: "completed",
      rowsSeen: 4,
      postsCreated: 1,
      message: "Failed to update stats for wf-1",
    });
  });

  it("calls a body that left early with a complaint failed", () => {
    const run = describeRun(null, ["No Google Drive connected for workflow wf-1"]);

    expect(run).toEqual({
      status: "failed",
      rowsSeen: 0,
      postsCreated: 0,
      message: "No Google Drive connected for workflow wf-1",
    });
  });

  it("calls a schedule that found nothing ready completed", () => {
    const run = describeRun(null, []);

    expect(run).toEqual({ status: "completed", rowsSeen: 0, postsCreated: 0, message: null });
  });

  it("joins every complaint a run collected after it opened", () => {
    const run = describeRun(null, [
      "Sheet for wf-1 needs at least 2 image_url_N columns",
      "Row processing failed for wf-1: timeout",
    ]);

    expect(run.message).toBe(
      "Sheet for wf-1 needs at least 2 image_url_N columns; Row processing failed for wf-1: timeout",
    );
  });
});

describe("closeWorkflowRun", () => {
  it("writes the outcome and stamps the end on the row it opened", async () => {
    const { supabase, updates, filters } = makeSupabase({});

    await closeWorkflowRun(supabase, "run-1", {
      status: "completed",
      rowsSeen: 12,
      postsCreated: 2,
    });

    expect(filters).toEqual(["id=run-1"]);
    const written = updates[0] as Record<string, unknown>;
    expect(written.status).toBe("completed");
    expect(written.rows_seen).toBe(12);
    expect(written.posts_created).toBe(2);
    expect(Date.parse(String(written.finished_at))).not.toBeNaN();
  });

  it("keeps the message a run was made of", async () => {
    const { supabase, updates } = makeSupabase({});

    await closeWorkflowRun(supabase, "run-1", {
      status: "failed",
      message: "No Google Drive connected",
    });

    expect(updates[0]).toMatchObject({ status: "failed", message: "No Google Drive connected" });
  });

  it("does nothing when the run was never opened", async () => {
    const write = vi.fn();
    const { supabase, updates } = makeSupabase({});
    supabase.from = write;

    await closeWorkflowRun(supabase, null, { status: "completed" });

    expect(write).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });

  it("swallows a failed close rather than failing the run it describes", async () => {
    const { supabase } = makeSupabase({ updateThrows: true });

    await expect(
      closeWorkflowRun(supabase, "run-1", { status: "completed" }),
    ).resolves.toBeUndefined();
  });
});
