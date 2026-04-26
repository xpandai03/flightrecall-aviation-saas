import type { StatusColor } from "@/lib/types/database";

/**
 * Single source of truth for the M3 status-color algorithm.
 *
 *   0 active issues  → green
 *   1–2             → yellow
 *   3+              → red
 *
 * Computed server-side at session creation (snapshot stored on
 * preflight_sessions.status_color) and live on
 * GET /api/v1/aircraft/[id]/status. Never computed client-side.
 */
export function computeStatusColor(activeIssueCount: number): StatusColor {
  if (activeIssueCount === 0) return "green";
  if (activeIssueCount <= 2) return "yellow";
  return "red";
}
