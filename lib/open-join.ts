/**
 * Open join by tail + aircraft type (owner-approved second join path,
 * alongside the invite code). Pure helpers shared by the join route's
 * cheap pre-DB gate and unit tests. The DB function
 * join_aircraft_by_tail() is the source of truth for the actual match +
 * membership insert; these mirror its normalization so the route can
 * reject obviously-empty submissions before a round-trip.
 *
 * Normalization MUST stay in lockstep with the SQL:
 *   tail → upper(regexp_replace(tail, '\s+', '', 'g'))         (matches
 *          normalize_tail_number() + join_aircraft_by_tail())
 *   type → lower(trim(type))                                    (case-
 *          insensitive, trimmed equality)
 */

/** Normalize a tail number exactly like the DB trigger/function: uppercase,
 *  strip ALL whitespace. */
export function normalizeTailForJoin(tail: string): string {
  return tail.replace(/\s+/g, "").toUpperCase();
}

/** Normalize an aircraft type for equality: trimmed, lowercased. */
export function normalizeTypeForJoin(type: string): string {
  return type.trim().toLowerCase();
}

/**
 * A join submission is well-formed iff BOTH a non-empty normalized tail AND
 * a non-empty normalized type are present (the signed-off match requires
 * both). Mirrors the NULL-returning guards in join_aircraft_by_tail().
 */
export function isJoinByTailWellFormed(tail: string, type: string): boolean {
  return normalizeTailForJoin(tail) !== "" && normalizeTypeForJoin(type) !== "";
}

/**
 * Pure match predicate used by tests to document the exact contract the SQL
 * enforces: a candidate aircraft matches iff its (already-normalized) stored
 * tail equals the normalized submitted tail AND its type matches
 * case-insensitively/trimmed. A null/blank stored type never matches
 * (fail-closed).
 */
export function aircraftMatchesJoin(
  candidate: { tail_number: string; aircraft_type: string | null },
  submittedTail: string,
  submittedType: string,
): boolean {
  if (!isJoinByTailWellFormed(submittedTail, submittedType)) return false;
  if (candidate.aircraft_type == null) return false;
  return (
    candidate.tail_number === normalizeTailForJoin(submittedTail) &&
    normalizeTypeForJoin(candidate.aircraft_type) ===
      normalizeTypeForJoin(submittedType)
  );
}
