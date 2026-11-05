import { formatDistanceToNow } from "date-fns";

/** What `workflow_runs` says about one run of one workflow. */
export type WorkflowRunSummary = {
  started_at: string;
  triggered_by: string;
  status: string;
  rows_seen: number;
  posts_created: number;
  message: string | null;
};

export function describeWorkflowRun(run: WorkflowRunSummary): string {
  const when = formatDistanceToNow(new Date(run.started_at), { addSuffix: true });
  const who = run.triggered_by === "manual" ? "manual run" : "last run";

  if (run.status === "running") return `${who} ${when} · still running`;
  if (run.status === "failed") {
    return `${who} ${when} · failed: ${run.message ?? "no reason recorded"}`;
  }
  if (run.posts_created > 0) return `${who} ${when} · ${run.posts_created} posts created · publication not confirmed`;
  if (run.rows_seen === 0) return `${who} ${when} · nothing was ready`;
  return `${who} ${when} · ${run.message ?? "no posts created"}`;
}
