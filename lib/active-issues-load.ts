import type { SupabaseClient } from "@supabase/supabase-js";

import {
  compareCriticalIssuesEnriched,
  isRecurrenceAction,
} from "@/lib/dashboard-issue-ranking";
import type {
  ActiveIssueEnriched,
  ActiveIssuesBySeverity,
} from "@/lib/types/database";

function flightsSinceForIssue(
  lastSeenAt: string,
  sessionTimes: number[],
): number {
  const lastSeenMs = new Date(lastSeenAt).getTime();
  const sessionsSince = sessionTimes.filter((t) => t > lastSeenMs).length;
  return Math.max(1, sessionsSince + 1);
}

/**
 * Loads active issues for an aircraft, split by issue_types.severity_class,
 * with recurrence (logged + still only) and originating session (earliest
 * observation by created_at).
 */
export async function loadActiveIssuesBySeverity(
  supabase: SupabaseClient,
  aircraftId: string,
): Promise<ActiveIssuesBySeverity> {
  const [issuesRes, sessionsRes] = await Promise.all([
    supabase
      .from("issues")
      .select("*, issue_type:issue_types(*)")
      .eq("aircraft_id", aircraftId)
      .eq("current_status", "active"),
    supabase
      .from("preflight_sessions")
      .select("created_at")
      .eq("aircraft_id", aircraftId)
      .order("created_at", { ascending: true }),
  ]);

  if (issuesRes.error) {
    throw new Error(issuesRes.error.message);
  }
  if (sessionsRes.error) {
    throw new Error(sessionsRes.error.message);
  }

  const rows = issuesRes.data ?? [];
  const issueIds = rows.map((r) => r.id);
  const sessionTimes = (sessionsRes.data ?? []).map((s) =>
    new Date(s.created_at).getTime(),
  );

  const obsByIssue = new Map<
    string,
    { action: string; preflight_session_id: string; created_at: string }[]
  >();

  if (issueIds.length > 0) {
    const obsRes = await supabase
      .from("issue_observations")
      .select("issue_id, action, preflight_session_id, created_at")
      .in("issue_id", issueIds)
      .order("created_at", { ascending: true });
    if (obsRes.error) {
      throw new Error(obsRes.error.message);
    }
    for (const row of obsRes.data ?? []) {
      const list = obsByIssue.get(row.issue_id) ?? [];
      list.push(row);
      obsByIssue.set(row.issue_id, list);
    }
  }

  const nowMs = Date.now();

  const enriched: ActiveIssueEnriched[] = rows.map((issue) => {
    const obs = obsByIssue.get(issue.id) ?? [];
    const sortedObs = [...obs].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    const originating_session_id =
      sortedObs.length > 0 ? sortedObs[0].preflight_session_id : null;
    const recurrence_count = sortedObs.filter((o) =>
      isRecurrenceAction(o.action),
    ).length;
    const flights_since = flightsSinceForIssue(
      issue.last_seen_at,
      sessionTimes,
    );
    return {
      ...issue,
      issue_type: issue.issue_type as ActiveIssueEnriched["issue_type"],
      flights_since,
      originating_session_id,
      recurrence_count,
    };
  });

  const critical = enriched
    .filter((i) => i.issue_type.severity_class === "critical")
    .sort((a, b) => compareCriticalIssuesEnriched(a, b, nowMs));

  const cosmetic = enriched
    .filter((i) => i.issue_type.severity_class === "cosmetic")
    .sort(
      (a, b) =>
        new Date(b.last_seen_at).getTime() -
        new Date(a.last_seen_at).getTime(),
    );

  return { critical, cosmetic };
}
