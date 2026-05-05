import type { ActiveIssue } from "@/lib/types/database";

export type IssueSeverity = "critical" | "warning" | "resolved";

export type IssueHistoryInput = {
  flights_since: number;
  // Future: V1 keyword extraction will populate occurrences with each
  // session a given issue was noted in. Today this stays undefined and
  // formatIssueHistory falls back to the flights_since-only path.
  occurrences?: Array<{ flight_index: number }>;
};

/**
 * Humanized history string for an active issue. Returns "" when there's
 * nothing meaningful to surface so the IssueCard can collapse the line.
 */
export function formatIssueHistory(input: IssueHistoryInput): string {
  // TODO: when occurrences is populated, render multi-touch history
  // ("Seen X flights ago. Also noted Y flights ago.").
  if (input.occurrences && input.occurrences.length >= 2) {
    return "";
  }
  if (input.flights_since <= 1) return "";
  return `Seen ${input.flights_since} flights ago`;
}

/**
 * Per-issue severity. Locked rule:
 *   resolved          → 'resolved'
 *   flights_since ≤ 1 → 'critical' (seen on the most recent flight)
 *   else              → 'warning'
 */
export function deriveIssueSeverity(issue: ActiveIssue): IssueSeverity {
  if (issue.current_status === "resolved") return "resolved";
  if (issue.flights_since <= 1) return "critical";
  return "warning";
}

/** Maps per-issue severity to the StatusPill variant used in IssueCard.
 *  'all_clear' is intentionally absent here — it's reserved for empty states. */
export function mapSeverityToPillVariant(
  severity: IssueSeverity,
): "needs_attention" | "monitor" | "resolved" {
  if (severity === "critical") return "needs_attention";
  if (severity === "warning") return "monitor";
  return "resolved";
}
