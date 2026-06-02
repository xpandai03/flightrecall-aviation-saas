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
  // M4 Item 2 — new generic-critical types (see migration
  // 20260602120000_m4_keyword_expansion_severities.sql).
  damage: "critical",
  dent: "cosmetic",
  flat_tire: "critical",
  // M4 Item 2 — reclassified cosmetic→critical (a flickering instrument /
  // avionics indicator is a safety signal, not cosmetic). Reclassifies
  // ALL existing + future flicker issues.
  flicker: "critical",
  fuel_contamination: "critical",
  fuel_leak: "critical",
  fuel_smell: "critical",
  hole: "critical",
  leak_general: "critical",
  // M4 Item 2 — reclassified cosmetic→critical (a loose control/fastener
  // is critical; safest-when-ambiguous). Reclassifies ALL existing +
  // future loose_panel issues.
  loose_panel: "critical",
  low_voltage: "critical",
  missing_fastener: "critical",
  not_working: "critical",
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
  // M4 Item 2 — reclassified cosmetic→critical (low tire pressure is a
  // dispatch item; "low pressure" keyword maps here). Reclassifies ALL
  // existing + future tire_low issues.
  tire_low: "critical",
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
