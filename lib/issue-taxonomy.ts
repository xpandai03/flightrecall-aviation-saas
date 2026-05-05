/**
 * UI-facing taxonomy view: the canonical location labels surfaced by
 * the M5 keyword extractor, exported as a sorted list for dropdowns
 * and other selection UIs.
 *
 * Kept in its own module (rather than re-exported from
 * lib/issue-extraction.ts) so the extraction pipeline stays pure
 * pipeline-layer — UI consumers never reach into the extractor's
 * internals.
 *
 * Source-of-truth: matches the unique values of LOCATION_KEYWORDS in
 * lib/issue-extraction.ts and the labels written to issues.location.
 * If a new location is added there, add it here too.
 */
export const LOCATION_LABELS = [
  "Cockpit",
  "Engine Area",
  "Fuselage",
  "Landing Gear",
  "Left Wing",
  "Right Wing",
  "Tail",
] as const;

export type LocationLabel = (typeof LOCATION_LABELS)[number];
