import { describe, it, expect } from "vitest";
import { describeWorkflowRun, type WorkflowRunSummary } from "./workflow-run-label";

function run(over: Partial<WorkflowRunSummary> = {}): WorkflowRunSummary {
  return {
    started_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    triggered_by: "cron",
    status: "completed",
    rows_seen: 2,
    posts_created: 2,
    message: null,
    ...over,
  };
}

describe("describeWorkflowRun", () => {
  it("reports created posts without claiming publication", () => {
    expect(describeWorkflowRun(run())).toMatch(/last run .* · 2 posts created · publication not confirmed$/);
  });

  it("does not claim that ready rows were posted when no post was inserted", () => {
    expect(describeWorkflowRun(run({ posts_created: 0 }))).toMatch(/· no posts created$/);
  });

  it("says the schedule found nothing ready", () => {
    expect(describeWorkflowRun(run({ rows_seen: 0, posts_created: 0 }))).toMatch(
      /last run .* · nothing was ready$/,
    );
  });

  it("says rows were ready but none went out", () => {
    expect(
      describeWorkflowRun(
        run({ rows_seen: 3, posts_created: 0, message: "YouTube refused the upload" }),
      ),
    ).toMatch(/last run .* · YouTube refused the upload$/);
  });

  it("says what a failed run complained about", () => {
    expect(
      describeWorkflowRun(
        run({ status: "failed", rows_seen: 0, posts_created: 0, message: "No Google Drive connected" }),
      ),
    ).toMatch(/last run .* · failed: No Google Drive connected$/);
  });

  it("does not call a failed run that kept quiet a success", () => {
    expect(describeWorkflowRun(run({ status: "failed", message: null }))).toMatch(
      /· failed: no reason recorded$/,
    );
  });

  it("names a manual run", () => {
    expect(describeWorkflowRun(run({ triggered_by: "manual" }))).toMatch(/^manual run /);
  });

  it("says a run still going is still going", () => {
    expect(describeWorkflowRun(run({ status: "running" }))).toMatch(/· still running$/);
  });
});
