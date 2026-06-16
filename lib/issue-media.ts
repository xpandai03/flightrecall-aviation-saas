/**
 * A4 — linked-media counts for the active-issue quick-view card. Pure (no
 * I/O) so they are unit-testable; the loader fetches the rows (RLS-scoped)
 * and these derive the per-issue counts.
 *
 * Photos: media_assets directly linked to the issue (media_assets.issue_id —
 *   set by the photo quick-tag path and the Item-3 photo+voice binding).
 * Voice: observations that carry a transcript (raw_transcript is populated
 *   by voice extraction; null for photo quick-tags) → "N voice notes".
 */

type MediaRow = { issue_id?: string | null; media_type?: string | null };

/** issue_id → count of directly-linked PHOTOS. */
export function countPhotosByIssue(rows: MediaRow[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (!r.issue_id || r.media_type !== "photo") continue;
    counts.set(r.issue_id, (counts.get(r.issue_id) ?? 0) + 1);
  }
  return counts;
}

/** # of observations that came from a voice note (have a transcript). */
export function countVoiceObservations(
  obs: { raw_transcript?: string | null }[],
): number {
  return obs.filter(
    (o) => typeof o.raw_transcript === "string" && o.raw_transcript.trim().length > 0,
  ).length;
}

/** Compact "linked media" label, or null when there's none (clean card). */
export function linkedMediaLabel(photos: number, voice: number): string | null {
  const parts: string[] = [];
  if (photos > 0) parts.push(`${photos} photo${photos === 1 ? "" : "s"}`);
  if (voice > 0) parts.push(`${voice} voice`);
  return parts.length > 0 ? parts.join(" · ") : null;
}
