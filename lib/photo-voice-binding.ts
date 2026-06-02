/**
 * M4 Item 3 — photo + voice as ONE observation: the pure decision for how
 * a photo-attached voice note binds to an issue.
 *
 * Pure module — no I/O, no `server-only` — so it is unit-testable and can
 * be imported from the background transcription job.
 *
 * Decisions (Raunek/Zach signed-off):
 *  1. The photo binds to the FIRST extracted issue (voice wins).
 *  2. The quick_tag is a FALLBACK only: it creates+links an issue solely
 *     when the voice extracted nothing. Voice and tag never both produce
 *     an issue for one observation (the tag issue is deferred at upload,
 *     so the only way a tag issue exists is via this fallback).
 */

export type PhotoVoiceBinding =
  | { action: "bind"; issueId: string }
  | { action: "fallback"; quickTag: string }
  | { action: "none" };

export function decidePhotoVoiceBinding(args: {
  /** First issue id persisted from the voice transcript, or null if none. */
  firstExtractedIssueId: string | null;
  /** The photo's quick_tag, if the user set one (fallback owner). */
  photoQuickTag: string | null;
  /** The photo's current issue_id — should be null when deferred. */
  photoExistingIssueId: string | null;
}): PhotoVoiceBinding {
  const { firstExtractedIssueId, photoQuickTag, photoExistingIssueId } = args;

  // Voice wins: bind the photo to the first extracted issue.
  if (firstExtractedIssueId) {
    return { action: "bind", issueId: firstExtractedIssueId };
  }

  // Voice extracted nothing → fall back to the quick_tag (only if the
  // photo isn't already linked to an issue).
  if (photoQuickTag && !photoExistingIssueId) {
    return { action: "fallback", quickTag: photoQuickTag };
  }

  // Nothing to bind: transcript-only photo.
  return { action: "none" };
}
