import type { Workflow } from "./types";

function simpleHash(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function computeTargetsForDay(
  workflowId: string,
  dateStr: string,
  ranges: { start: number; end: number }[]
): number[] {
  return ranges.map((range, ri) => {
    const windowSize = Math.max(range.end - range.start, 1);
    const seed = workflowId + dateStr + ri;
    const h = simpleHash(seed);
    const randomMin = Math.abs(h) % (windowSize * 60);
    return range.start * 60 + randomMin;
  });
}

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${m.toString().padStart(2, "0")} UTC`;
}

export function getNextPublishTime(workflow: Workflow, now: Date = new Date()): string | null {
  const mode = workflow.scheduling_mode;
  if (!mode) return null;

  const utcDay = now.getUTCDay();
  const utcDate = now.toISOString().slice(0, 10);
  const currentMin = now.getUTCHours() * 60 + now.getUTCMinutes();

  if (mode === "custom_ranges") {
    const cs = workflow.custom_schedule;
    if (!cs) return null;

    const todayRanges = cs[utcDay.toString()] ?? [];
    if (todayRanges.length > 0) {
      const targets = computeTargetsForDay(workflow.id, utcDate, todayRanges);
      for (const t of targets) {
        if (t > currentMin) return formatTime(t);
      }
    }

    for (let offset = 1; offset <= 7; offset++) {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() + offset);
      const day = d.getUTCDay();
      const ranges = cs[day.toString()];
      if (!ranges || ranges.length === 0) continue;
      const dateStr = d.toISOString().slice(0, 10);
      const targets = computeTargetsForDay(workflow.id, dateStr, ranges);
      if (targets.length > 0) {
        const label = offset === 1 ? "Tomorrow" : `+${offset}d`;
        return `${label} ${formatTime(targets[0])}`;
      }
    }
    return null;
  }

  if (mode === "interval") {
    const intervalH = workflow.run_interval_hours ?? 2;
    const last = workflow.last_triggered_at;
    if (!last) return "Now";

    const next = new Date(new Date(last).getTime() + intervalH * 3600000);
    if (next <= now) return "Now";

    const diffMs = next.getTime() - now.getTime();
    const h = Math.floor(diffMs / 3600000);
    const m = Math.floor((diffMs % 3600000) / 60000);
    return h > 0 ? `~${h}h ${m}m` : `~${m}m`;
  }

  if (mode === "once_daily") {
    const last = workflow.last_triggered_at;
    const lastDate = last ? new Date(last).toISOString().slice(0, 10) : null;
    const runDays = workflow.run_days ?? [0, 1, 2, 3, 4, 5, 6];

    if (lastDate === utcDate) {
      for (let offset = 1; offset <= 7; offset++) {
        const day = (utcDay + offset) % 7;
        if (runDays.includes(day)) return offset === 1 ? "Tomorrow" : `+${offset}d`;
      }
      return null;
    }

    if (runDays.includes(utcDay)) return "Today";
    for (let offset = 1; offset <= 7; offset++) {
      const day = (utcDay + offset) % 7;
      if (runDays.includes(day)) return offset === 1 ? "Tomorrow" : `+${offset}d`;
    }
    return null;
  }

  return null;
}
