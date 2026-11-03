/** One hour range of a day: `[start, end)` in UTC hours. */
export type HourRange = { start: number; end: number };

export interface ScheduledWorkflow {
  id?: string | null;
  scheduling_mode?: string | null;
  run_days?: number[] | null;
  run_interval_hours?: number | null;
  last_triggered_at?: string | null;
  custom_schedule?: Record<string, HourRange[]> | null;
}

/** How long a custom-range target stays open for the cron tick that reaches it. */
const WINDOW_MINUTES = 5;

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

/** `YYYY-MM-DD` in UTC, the day key the schedule and the trigger stamp share. */
function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function minutesOfDay(now: Date): number {
  return now.getUTCHours() * 60 + now.getUTCMinutes();
}

/**
 * The minute of the day a custom range fires at.
 *
 * It comes from a hash of the workflow, the day and the range index, so the
 * target is spread over the range yet the same for every cron tick of that day.
 */
export function customRangeTarget(
  workflowId: string | null | undefined,
  day: string,
  rangeIndex: number,
  range: HourRange,
): number {
  const seed = String(workflowId ?? "") + day + rangeIndex;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  const rangeWindowMinutes = Math.max(range.end - range.start, 1) * 60;
  return range.start * 60 + (Math.abs(hash) % rangeWindowMinutes);
}

/**
 * Why this workflow should not run on this tick, or null when it should.
 *
 * `last_triggered_at` is the only memory between ticks, so every mode reads it
 * before firing: a cron tick that lands twice inside one window must not
 * publish the same rows twice.
 */
export function skipReason(wf: ScheduledWorkflow, now: Date): string | null {
  const mode = wf.scheduling_mode || "once_daily";
  const last = wf.last_triggered_at ? new Date(wf.last_triggered_at) : null;

  if (mode === "custom_ranges") {
    const day = dayKey(now);
    const ranges = wf.custom_schedule?.[String(now.getUTCDay())] ?? [];
    if (ranges.length === 0) return `No custom ranges for UTC day ${now.getUTCDay()}`;

    const current = minutesOfDay(now);
    for (let ri = 0; ri < ranges.length; ri++) {
      const target = customRangeTarget(wf.id, day, ri, ranges[ri]);
      if (current < target || current >= target + WINDOW_MINUTES) continue;
      const windowStart = Date.parse(`${day}T00:00:00.000Z`) + target * 60_000;
      if (last && last.getTime() >= windowStart && last.getTime() < windowStart + WINDOW_MINUTES * 60_000) {
        return `Range #${ri} already triggered today`;
      }
      return null;
    }
    return "Outside every range window today";
  }

  const runDays = wf.run_days ?? ALL_DAYS;
  if (!runDays.includes(now.getUTCDay())) {
    return `Not scheduled for UTC day ${now.getUTCDay()}`;
  }

  if (mode === "interval") {
    const intervalHours = wf.run_interval_hours ?? 2;
    if (last) {
      const hoursSince = (now.getTime() - last.getTime()) / 3_600_000;
      if (hoursSince + 1 / 60 < intervalHours) {
        return `Last triggered ${hoursSince.toFixed(1)}h ago, waits for ${intervalHours}h`;
      }
    }
    return null;
  }

  if (last && dayKey(last) === dayKey(now)) return "Already triggered today";
  return null;
}
