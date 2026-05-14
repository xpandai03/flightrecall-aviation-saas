import { describe, expect, it } from "vitest";

import {
  compareCriticalIssuesEnriched,
  criticalIssueScore,
  deriveDashboardUrgencyAccent,
  isRecurrenceAction,
  recurrenceWeight,
  recencyWeight,
} from "@/lib/dashboard-issue-ranking";

describe("dashboard-issue-ranking", () => {
  it("isRecurrenceAction filters fixed/skipped", () => {
    expect(isRecurrenceAction("logged")).toBe(true);
    expect(isRecurrenceAction("still")).toBe(true);
    expect(isRecurrenceAction("fixed")).toBe(false);
    expect(isRecurrenceAction("skipped")).toBe(false);
  });

  it("criticalIssueScore matches locked formula", () => {
    const now = Date.now();
    const lastSeen = new Date(now - 10 * 86_400_000).toISOString();
    const days = 10;
    const s = criticalIssueScore({
      flightsSince: 3,
      daysSinceSeen: days,
      recurrenceCount: 1,
    });
    const rw = recencyWeight(3, days);
    const vw = recurrenceWeight(1);
    expect(s).toBe(10 + rw * 5 + vw * 3);
  });

  it("deriveDashboardUrgencyAccent: red path via recurrence", () => {
    expect(
      deriveDashboardUrgencyAccent({
        recurrenceCount: 2,
        flightsSince: 5,
        daysSinceSeen: 30,
      }),
    ).toBe("high");
  });

  it("deriveDashboardUrgencyAccent: red path via recent flight", () => {
    expect(
      deriveDashboardUrgencyAccent({
        recurrenceCount: 1,
        flightsSince: 1,
        daysSinceSeen: 0,
      }),
    ).toBe("high");
  });

  it("deriveDashboardUrgencyAccent: yellow single touch within 7 days", () => {
    expect(
      deriveDashboardUrgencyAccent({
        recurrenceCount: 1,
        flightsSince: 4,
        daysSinceSeen: 3,
      }),
    ).toBe("medium");
  });

  it("deriveDashboardUrgencyAccent: default older single", () => {
    expect(
      deriveDashboardUrgencyAccent({
        recurrenceCount: 1,
        flightsSince: 4,
        daysSinceSeen: 14,
      }),
    ).toBe("low");
  });

  it("compareCriticalIssuesEnriched tie-breaks on last_seen_at DESC", () => {
    const now = Date.UTC(2026, 4, 14, 12, 0, 0);
    const a = {
      flights_since: 2,
      last_seen_at: "2026-05-10T12:00:00.000Z",
      recurrence_count: 1,
    };
    const b = {
      flights_since: 2,
      last_seen_at: "2026-05-12T12:00:00.000Z",
      recurrence_count: 1,
    };
    expect(compareCriticalIssuesEnriched(a, b, now)).toBeGreaterThan(0);
    expect(compareCriticalIssuesEnriched(b, a, now)).toBeLessThan(0);
  });
});
