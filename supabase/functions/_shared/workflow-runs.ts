/// The run row a workflow tick leaves behind.
///
/// A cron tick that posts nothing looks exactly like a tick that failed: the
/// counters on `workflows` move only when a video was posted, and the errors a
/// run collected live in an HTTP response nobody keeps. These two calls put one
/// row on the database for every workflow a run actually entered, so the answer
/// to "did it run, and what did it do?" is a select away.
///
/// Recording is never worth a publish. Both calls answer null, or swallow, so a
/// history table that cannot be written cannot stop a video from going out.

export type WorkflowRunTrigger = "cron" | "manual";
export type WorkflowRunOutcome = "completed" | "failed";

/**
 * What a run that is ending should record about itself.
 *
 * `report` is what the workflow body had ready and made; null means it left
 * before reaching its counters. A body that got that far completed whatever
 * else it complained about; one that left early with a complaint failed; one
 * that left early with nothing to say completed without having made anything —
 * which is the answer to "why did nothing post?".
 */
export function describeRun(
  report: { rows: number; posts: number } | null,
  newErrors: string[],
): {
  status: WorkflowRunOutcome;
  rowsSeen: number;
  postsCreated: number;
  message: string | null;
} {
  const message = newErrors.join("; ") || null;
  return {
    status: (report || !message) ? "completed" : "failed",
    rowsSeen: report?.rows ?? 0,
    postsCreated: report?.posts ?? 0,
    message,
  };
}

/// The id of the new row, or null when nothing could be recorded.
export async function openWorkflowRun(
  supabase: any,
  input: { workflowId: string; triggeredBy: WorkflowRunTrigger },
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("workflow_runs")
      .insert({ workflow_id: input.workflowId, triggered_by: input.triggeredBy })
      .select("id")
      .single();
    if (error || !data?.id) {
      console.error("workflow run open failed", error?.message ?? "no id came back");
      return null;
    }
    return data.id as string;
  } catch (err) {
    console.error("workflow run open threw", err);
    return null;
  }
}

/// Ends the run, or does nothing if the run was never opened.
///
/// A run that saw no rows is `completed` with `rowsSeen: 0`, not a failure: the
/// schedule asked, and there was nothing ready. Say what the run was made of in
/// `message` — the reason it was skipped, or the error that ended it.
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
  try {
    await supabase
      .from("workflow_runs")
      .update({
        status: outcome.status,
        rows_seen: outcome.rowsSeen ?? 0,
        posts_created: outcome.postsCreated ?? 0,
        message: outcome.message ?? null,
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);
  } catch (err) {
    console.error("workflow run close failed", err);
  }
}
