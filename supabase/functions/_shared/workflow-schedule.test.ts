import { describe, it, expect } from "vitest";
import { customRangeTarget, skipReason, type ScheduledWorkflow } from "./workflow-schedule";

const mondayUtc = "2026-11-02"; // getUTCDay() === 1
const atMinute = (day: string, minutes: number) =>
  new Date(Date.parse(`${day}T00:00:00.000Z`) + minutes * 60_000);

const workflow = (over: Partial<ScheduledWorkflow> = {}): ScheduledWorkflow => ({
  id: "wf-1",
  scheduling_mode: "once_daily",
  last_triggered_at: null,
  ...over,
});

describe("skipReason for once_daily workflows", () => {
  it("runs on the first tick of the day", () => {
    expect(skipReason(workflow(), atMinute(mondayUtc, 8 * 60))).toBeNull();
  });

  it("runs again the day after a trigger", () => {
    const yesterday = atMinute("2026-11-01", 23 * 60);
    expect(skipReason(workflow({ last_triggered_at: yesterday.toISOString() }), atMinute(mondayUtc, 1))).toBeNull();
  });

  it("does not run twice on the same day", () => {
    const earlier = atMinute(mondayUtc, 3 * 60);
    expect(skipReason(workflow({ last_triggered_at: earlier.toISOString() }), atMinute(mondayUtc, 9 * 60)))
      .toMatch(/already/i);
  });

  it("keeps to the run days", () => {
    expect(skipReason(workflow({ run_days: [3, 4] }), atMinute(mondayUtc, 9 * 60))).toMatch(/not scheduled/i);
  });
});

describe("skipReason for interval workflows", () => {
  const everyTwoHours = workflow({ scheduling_mode: "interval", run_interval_hours: 2 });

  it("waits out the interval", () => {
    const last = atMinute(mondayUtc, 8 * 60);
    expect(skipReason({ ...everyTwoHours, last_triggered_at: last.toISOString() }, atMinute(mondayUtc, 9 * 60)))
      .toMatch(/last triggered/i);
  });

  it("runs once the interval has passed", () => {
    const last = atMinute(mondayUtc, 8 * 60);
    expect(skipReason({ ...everyTwoHours, last_triggered_at: last.toISOString() }, atMinute(mondayUtc, 10 * 60 + 1)))
      .toBeNull();
  });
});

describe("skipReason for custom-range workflows", () => {
  const ranges = { [String(new Date(`${mondayUtc}T00:00:00.000Z`).getUTCDay())]: [{ start: 9, end: 12 }] };
  const custom = workflow({ scheduling_mode: "custom_ranges", custom_schedule: ranges });
  const target = customRangeTarget("wf-1", mondayUtc, 0, { start: 9, end: 12 });

  it("stays inside the range it picked for the day", () => {
    expect(target).toBeGreaterThanOrEqual(9 * 60);
    expect(target).toBeLessThan(12 * 60);
    expect(customRangeTarget("wf-1", mondayUtc, 0, { start: 9, end: 12 })).toBe(target);
  });

  it("runs during its window", () => {
    expect(skipReason(custom, atMinute(mondayUtc, target))).toBeNull();
  });

  it("waits for the next window", () => {
    expect(skipReason(custom, atMinute(mondayUtc, target + 6))).toMatch(/outside/i);
  });

  it("does not run the same window twice", () => {
    const already = atMinute(mondayUtc, target);
    const secondTick = atMinute(mondayUtc, target + 1);
    expect(skipReason({ ...custom, last_triggered_at: already.toISOString() }, secondTick)).toMatch(/already/i);
  });

  it("runs a later window of the same day after an earlier one fired", () => {
    const dayRanges = { "1": [{ start: 0, end: 1 }, { start: 23, end: 24 }] };
    const twoRanges = workflow({ scheduling_mode: "custom_ranges", custom_schedule: dayRanges });
    const first = customRangeTarget("wf-1", mondayUtc, 0, { start: 0, end: 1 });
    const second = customRangeTarget("wf-1", mondayUtc, 1, { start: 23, end: 24 });
    expect(skipReason({ ...twoRanges, last_triggered_at: atMinute(mondayUtc, first).toISOString() }, atMinute(mondayUtc, second)))
      .toBeNull();
  });

  it("does not run on a day with no ranges", () => {
    expect(skipReason(custom, atMinute("2026-11-03", target))).toMatch(/no custom ranges/i);
  });
});
