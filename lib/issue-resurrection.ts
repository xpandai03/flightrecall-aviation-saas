/**
 * Resurrection-prevention helpers (M3 release fix, Bug #3).
 *
 * Background paths that observe an issue — voice keyword extraction
 * (persistOne) and the photo quick-tag upsert (upsertIssueForMedia) —
 * must never silently re-activate an issue the pilot explicitly marked
 * resolved. A resolved issue is immutable from these paths: a fresh
 * occurrence becomes a NEW issue row.
 *
 * Pure module — no I/O, no `server-only` — so it is unit-testable and
 * importable from both server routes and the background transcription
 * job.
 */

/**
 * Decide whether an extraction / quick-tag match should reuse an
 * existing issue row or insert a fresh one.
 *
 * Callers pass every issue row matching (aircraft_id, issue_type_id,
 * location) regardless of status. Only an ACTIVE row may be reused;
 * resolved rows are immutable from background paths. A match set with
 * no active row therefore resolves to "insert" — creating a new issue
 * rather than resurrecting a resolved one.
 *
 * Returning every candidate (rather than a `.maybeSingle()` lookup)
 * also avoids the "multiple rows" error once a resolved row and an
 * active row legitimately coexist for the same key.
 */
export function selectIssueForExtraction(
  candidates: { id: string; current_status: string }[],
): { action: "update"; id: string } | { action: "insert" } {
  const active = candidates.find((c) => c.current_status === "active");
  return active ? { action: "update", id: active.id } : { action: "insert" };
}
