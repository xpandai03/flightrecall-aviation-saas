/**
 * Aircraft pre-flight checklist — pure helpers (no I/O, no server-only) so
 * they are unit-testable and shareable between the API route and UI.
 *
 * Replace-semantics, NOT append-history: an aircraft keeps at most
 * CHECKLIST_CAP checklist images (front + back). A new upload beyond the
 * cap evicts the OLDEST, so the newest CHECKLIST_CAP are always retained.
 */

export const CHECKLIST_CAP = 2;

type Datable = { id: string; created_at: string };

function byCreatedAtDesc<T extends Datable>(a: T, b: T): number {
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

/**
 * Given all uploaded checklist images for an aircraft, return the ids of
 * the ones to EVICT to honor the cap — i.e. everything older than the
 * newest `cap`. Returns [] when within the cap.
 */
export function selectChecklistEvictions<T extends Datable>(
  uploaded: T[],
  cap: number = CHECKLIST_CAP,
): string[] {
  if (uploaded.length <= cap) return [];
  return [...uploaded].sort(byCreatedAtDesc).slice(cap).map((m) => m.id);
}

/**
 * The images to surface (newest-first, capped). Used by the GET endpoint
 * and the dashboard card so both agree on what "the checklist" is.
 */
export function visibleChecklist<T extends Datable>(
  uploaded: T[],
  cap: number = CHECKLIST_CAP,
): T[] {
  return [...uploaded].sort(byCreatedAtDesc).slice(0, cap);
}

/** Whether an aircraft has a checklist on file (drives the dashboard "+"). */
export function hasChecklist(uploaded: { length: number }): boolean {
  return uploaded.length > 0;
}

/** Whether another image may be added without replacing (drives "Add" vs "Replace"). */
export function canAddChecklist(count: number, cap: number = CHECKLIST_CAP): boolean {
  return count < cap;
}
