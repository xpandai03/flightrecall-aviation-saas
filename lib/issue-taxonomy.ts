import type { IssueSeverityClass } from "@/lib/types/database";

/**
 * UI-facing taxonomy view: the canonical location labels for dropdowns
 * and other selection UIs (M4 Item 1; see M4-punchlist-plan.md §Item 1).
 *
 * Kept in its own module (rather than re-exported from
 * lib/issue-extraction.ts) so the extraction pipeline stays pure
 * pipeline-layer — UI consumers never reach into the extractor's
 * internals.
 *
 * Two tiers:
 *  - VOICE labels: every unique value of LOCATION_KEYWORDS in
 *    lib/issue-extraction.ts (keyword-scannable AND pickable). Keep these
 *    in sync with that table.
 *  - PICKER-ONLY labels: the remaining Cessna 172R N9520D panel
 *    instruments from the 46-item equipment list. Manually selectable but
 *    deliberately NOT in LOCATION_KEYWORDS — short/ambiguous panel words
 *    ("clock", "panel") would flood the substring scanner.
 *
 * Grounded in the two exterior diagrams + the instrument-panel PDF +
 * Zach's named examples. No invented names. Grouped by zone for picker UX.
 */
export const LOCATION_LABELS = [
  // ---- Coarse zones (catch-alls) ----
  "Cockpit",
  "Engine Area",
  "Fuselage",
  "Landing Gear",
  "Tail",
  // ---- Wings + control surfaces (voice) ----
  "Left Wing",
  "Right Wing",
  "Left Wing Tip",
  "Right Wing Tip",
  "Wing Strut",
  "Left Aileron",
  "Right Aileron",
  "Left Flap",
  "Right Flap",
  // ---- Tail surfaces (voice) ----
  "Vertical Stabilizer",
  "Horizontal Stabilizer",
  "Rudder",
  "Elevator",
  "Trim Tab",
  // ---- Engine / nose (voice) ----
  "Engine Cowl",
  "Lower Cowling",
  "Propeller",
  // ---- Fuselage / cabin / doors (voice) ----
  "Cabin",
  "Door",
  "Left Door",
  "Right Door",
  "Windshield",
  "Static Port",
  "Pitot Tube",
  "Antennas",
  // ---- Landing gear (voice) ----
  "Nose Gear",
  "Left Main Gear",
  "Right Main Gear",
  "Nose Tire",
  "Left Tire",
  "Right Tire",
  // ---- Cockpit — voice subset ----
  "Annunciator Panel",
  "Attitude Indicator",
  "Airspeed Indicator",
  "Altimeter",
  "Transponder",
  "Autopilot",
  "Parking Brake",
  "Angle of Attack Indicator",
  "Yoke",
  // ---- Cockpit — picker-only instruments (NOT keyword-scanned) ----
  "Vacuum Gage and Ammeter",
  "Digital Clock / OAT Indicator",
  "Turn Coordinator",
  "Directional Gyro",
  "Vertical Speed Indicator",
  "EDM-900 Remote Annunciate Light",
  "KI 209A Course Deviation and Glide Slope Indicator",
  "KI 208 Course Indicator Head",
  "Engine Data Monitor System",
  "Audio Selector Panel",
  "GPS and Nav/Com Radio 1",
  "Nav/Com Radio 2",
  "Stormscope",
  "Portable iPad Mini Mount",
  "Dual USB Power Outlet",
  "Hour Meter",
  "ELT Remote Test Button",
  "Glove Box",
  "Cabin Heat Control",
  "Cabin Air Control",
  "Flap Switch and Position Indicator",
  "Mixture Control",
  "Alternate Static Air Control",
  "Hand Held Microphone",
  "Fuel Shutoff Valve Control",
  "Throttle Control",
  "Fuel Selector",
  "Pedestal Light",
  "Elevator Trim Control",
  "Glareshield and Pedestal Dimming Control",
  "Radio and Panel Dimming Control",
  "Avionics Master Switch",
  "Circuit Breakers",
  "Equipment Switches",
  "Master Switch",
  "Avionics Circuit Breakers",
  "Ignition Switch",
  // Item D — exterior lights (handed nav + landing), precise engine bay, GPS.
  "Landing Light",
  "Navigation Light",
  "Front Navigation Light",
  "Left Navigation Light",
  "Right Navigation Light",
  "Engine Bay",
  "GPS",
  // Item B — low-confidence fallback. Listed so the per-issue edit dropdown
  // offers it as a correctable value when extraction couldn't confidently
  // place an observation (issues.location is free text).
  "Location Unknown",
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
  // Item D — aviation vocabulary new types (see migration
  // 20260611140000_item_d_aviation_vocabulary.sql). All critical
  // (safest-when-ambiguous): blocked instrument / unreliable instrument /
  // comm loss / equipment out are all safety-relevant.
  comm_fault: "critical",
  corrosion: "critical",
  crack: "critical",
  equipment_out: "critical",
  instrument_fault: "critical",
  obstruction: "critical",
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
