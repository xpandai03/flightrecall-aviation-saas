/**
 * M3 Item 2 — deterministic ranking for critical active issues on the dashboard.
 * Unrelated to `IssueSeverity` in lib/issue-derivation.ts (recency pill for IssueCard).
 */

export type DashboardUrgencyAccent = "high" | "medium" | "low";

/** Recurrence evidence: only observations that mean the issue is still in play. */
export const RECURRENCE_ACTIONS = ["logged", "still"] as const;

export function isRecurrenceAction(
  action: string,
): action is (typeof RECURRENCE_ACTIONS)[number] {
  return action === "logged" || action === "still";
}

export function recurrenceWeight(recurrenceCount: number): number {
  return Math.min(Math.log2(recurrenceCount + 1), 4);
}

export function recencyWeight(
  flightsSince: number,
  daysSinceSeen: number,
): number {
  if (flightsSince <= 1) return 1;
  if (daysSinceSeen <= 7) return 0.5;
  return 0.1;
}

export function daysSince(isoLastSeen: string, nowMs: number): number {
  const ms = nowMs - new Date(isoLastSeen).getTime();
  return Math.max(0, ms / 86_400_000);
}

/**
 * Locked formula: score = 10 + (recency_weight * 5) + (recurrence_weight * 3)
 * Tie-breaker: last_seen_at DESC (handled in compareCriticalIssuesEnriched).
 */
export function criticalIssueScore(input: {
  flightsSince: number;
  daysSinceSeen: number;
  recurrenceCount: number;
}): number {
  const rw = recencyWeight(input.flightsSince, input.daysSinceSeen);
  const vw = recurrenceWeight(input.recurrenceCount);
  return 10 + rw * 5 + vw * 3;
}

export function deriveDashboardUrgencyAccent(input: {
  recurrenceCount: number;
  flightsSince: number;
  daysSinceSeen: number;
}): DashboardUrgencyAccent {
  if (input.recurrenceCount >= 2 || input.flightsSince <= 1) return "high";
  if (input.recurrenceCount === 1 && input.daysSinceSeen <= 7) return "medium";
  return "low";
}

export function compareCriticalIssuesEnriched(
  a: {
    flights_since: number;
    last_seen_at: string;
    recurrence_count: number;
  },
  b: {
    flights_since: number;
    last_seen_at: string;
    recurrence_count: number;
  },
  nowMs: number,
): number {
  const da = daysSince(a.last_seen_at, nowMs);
  const db = daysSince(b.last_seen_at, nowMs);
  const sa = criticalIssueScore({
    flightsSince: a.flights_since,
    daysSinceSeen: da,
    recurrenceCount: a.recurrence_count,
  });
  const sb = criticalIssueScore({
    flightsSince: b.flights_since,
    daysSinceSeen: db,
    recurrenceCount: b.recurrence_count,
  });
  if (sa !== sb) return sb - sa;
  return (
    new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime()
  );
}
