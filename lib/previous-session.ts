import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A2 — Aircraft Memory Recall: the last 3 observations from the aircraft's
 * PREVIOUS completed session ("what was observed last flight").
 *
 * "previous session" = the most recent preflight_sessions row for this
 * aircraft with finalized_at set (completed). The in-progress session has
 * finalized_at = null, so filtering on finalized_at NOT NULL naturally
 * excludes it. "last 3 observations" = that session's 3 newest
 * issue_observations (created_at desc).
 *
 * Runs on the caller's client → Phase-1 RLS / membership scopes it (a
 * co-pilot on a shared aircraft sees it too). No media bytes fetched.
 */

export const PREVIOUS_OBS_LIMIT = 3;

export type PreviousObservation = {
  id: string;
  type: string;
  location: string;
  status: string;
};

export type PreviousSessionRecall = {
  sessionDateIso: string;
  observations: PreviousObservation[];
};

type RawObsRow = {
  id?: string | null;
  created_at?: string | null;
  issue?: {
    location?: string | null;
    current_status?: string | null;
    issue_type?: { name?: string | null } | null;
  } | null;
};

/** Pure: shape a raw observation row into the render model. */
export function shapeObservation(row: RawObsRow): PreviousObservation | null {
  if (!row.id || !row.issue) return null;
  return {
    id: row.id,
    type: row.issue.issue_type?.name?.trim() || "Issue",
    location: row.issue.location?.trim() || "Location not specified",
    status: row.issue.current_status === "resolved" ? "Resolved" : "Active",
  };
}

/** Pure: "Oil Leak · Fuselage · Active". */
export function formatObservationLine(o: PreviousObservation): string {
  return `${o.type} · ${o.location} · ${o.status}`;
}

export async function loadPreviousSessionObservations(
  supabase: SupabaseClient,
  aircraftId: string,
): Promise<PreviousSessionRecall | null> {
  // Most recent COMPLETED session (finalized_at set → excludes in-progress).
  const { data: session, error: sErr } = await supabase
    .from("preflight_sessions")
    .select("id, created_at, finalized_at")
    .eq("aircraft_id", aircraftId)
    .not("finalized_at", "is", null)
    .order("finalized_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (sErr) throw new Error(sErr.message);
  if (!session) return null;

  // Its 3 newest observations.
  const { data: rows, error: oErr } = await supabase
    .from("issue_observations")
    .select(
      "id, created_at, issue:issues(location, current_status, issue_type:issue_types(name))",
    )
    .eq("preflight_session_id", session.id)
    .order("created_at", { ascending: false })
    .limit(PREVIOUS_OBS_LIMIT);
  if (oErr) throw new Error(oErr.message);

  const observations = (rows ?? [])
    .map((r) => shapeObservation(r as RawObsRow))
    .filter((o): o is PreviousObservation => o !== null);

  return {
    sessionDateIso: session.finalized_at ?? session.created_at,
    observations,
  };
}
