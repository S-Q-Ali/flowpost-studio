export type WorkflowRunTrigger = "cron" | "manual";
export type WorkflowRunOutcome = "completed" | "failed";

export function describeRun(
  report: { rows: number; posts: number } | null,
  newErrors: string[],
  failed = false,
): {
  status: WorkflowRunOutcome;
  rowsSeen: number;
  postsCreated: number;
  message: string | null;
} {
  const message = newErrors.join("; ") || null;
  return {
    status: failed || (message && !report?.posts) ? "failed" : "completed",
    rowsSeen: report?.rows ?? 0,
    postsCreated: report?.posts ?? 0,
    message,
  };
}

// History must give publishing its connection back even when the database stalls.
async function historyRequest<T>(
  request: (signal: AbortSignal) => PromiseLike<{ data?: T; error: unknown }>,
): Promise<T | null> {
  try {
    const { data, error } = await request(AbortSignal.timeout(1000));
    if (error) throw error;
    return data ?? null;
  } catch (err) {
    console.error("workflow history request failed", err);
    return null;
  }
}

export async function openWorkflowRun(
  supabase: any,
  input: { workflowId: string; triggeredBy: WorkflowRunTrigger },
): Promise<string | null> {
  const data = await historyRequest<{ id: string }>((signal) => supabase
    .from("workflow_runs")
    .insert({ workflow_id: input.workflowId, triggered_by: input.triggeredBy })
    .select("id")
    .single()
    .abortSignal(signal));
  return data?.id ?? null;
}

export async function closeWorkflowRun(
  supabase: any,
  runId: string | null,
  outcome: {
    status: WorkflowRunOutcome;
    rowsSeen?: number;
    postsCreated?: number;
    message?: string | null;
  },
): Promise<void> {
  if (!runId) return;
  await historyRequest((signal) => supabase
    .from("workflow_runs")
    .update({
      status: outcome.status,
      rows_seen: outcome.rowsSeen ?? 0,
      posts_created: outcome.postsCreated ?? 0,
      message: outcome.message ?? null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId)
    .abortSignal(signal));
}

export async function maintainWorkflowRuns(supabase: any): Promise<void> {
  const now = Date.now();
  await Promise.all([
    historyRequest((signal) => supabase.from("workflow_runs").delete()
      .lt("started_at", new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString())
      .abortSignal(signal)),
    historyRequest((signal) => supabase.from("workflow_runs").update({
      status: "failed",
      message: "the run stopped answering",
      finished_at: new Date(now).toISOString(),
    }).eq("status", "running")
      .lt("started_at", new Date(now - 20 * 60 * 1000).toISOString())
      .abortSignal(signal)),
  ]);
}
