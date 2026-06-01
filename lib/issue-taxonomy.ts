import type { IssueSeverityClass } from "@/lib/types/database";

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

/**
 * Type-level critical vs cosmetic (M3). Must mirror
 * issue_types.severity_class in supabase/migrations/20260514120000_m3_add_issue_severity_class.sql.
 * This is not `IssueSeverity` in lib/issue-derivation.ts — that type is recency/status for pills
 * (critical / warning / resolved) and is unrelated to taxonomy.
 */
export const SEVERITY_MAP: Record<string, IssueSeverityClass> = {
  avionics_reset: "cosmetic",
  battery_weak: "critical",
  binding: "critical",
  brake_soft: "critical",
  brake_wear: "critical",
  cable_issue: "critical",
  cap_loose: "critical",
  corrosion: "critical",
  crack: "critical",
  dent: "cosmetic",
  flat_tire: "critical",
  flicker: "cosmetic",
  fuel_contamination: "critical",
  fuel_leak: "critical",
  fuel_smell: "critical",
  loose_panel: "cosmetic",
  low_voltage: "critical",
  missing_fastener: "critical",
  oil: "critical",
  oil_dirty: "critical",
  oil_leak: "critical",
  oil_low: "critical",
  other: "cosmetic",
  rough_engine: "critical",
  scratch: "cosmetic",
  something_off: "cosmetic",
  stiff_control: "critical",
  tire: "cosmetic",
  tire_low: "cosmetic",
  tire_worn: "critical",
  unusual_noise: "critical",
  unusual_resistance: "critical",
  vibration: "critical",
};

export function getSeverityForSlug(slug: string): IssueSeverityClass {
  const s = SEVERITY_MAP[slug];
  if (s === undefined) {
    throw new Error(`Unknown issue type slug: ${slug}`);
  }
  return s;
}
