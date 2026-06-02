import { describe, expect, it } from "vitest";

import { extractIssues } from "@/lib/issue-extraction";

/**
 * Fixture-locked regression cases for keyword extraction.
 *
 * Each fixture is a single transcript with its expected first extracted
 * issue (or `null` when nothing should extract). This file exists to
 * pin down known-good behaviour — especially the client-reported
 * failing case — so it can never silently regress.
 *
 * Scope note: the worn-tire case below is the M3 release fix. The
 * "small dent on passenger side door" case already extracted correctly
 * before the fix; it is locked here as a regression anchor, not as a
 * change. Vocabulary expansion (more keywords / locations) is M4.
 */

type Fixture = {
  input: string;
  /** Expected first issue, or null when no issue should extract. */
  expected: { type: string; location: string | null } | null;
  note?: string;
};

const FIXTURES: Fixture[] = [
  // --- Client-reported cases (Zach, M3 release testing) ---------------
  {
    input: "right main tire looks worn",
    expected: { type: "tire_worn", location: "Right Tire" },
    note: "Case 1 — M4 Item 1: 'right main tire' prefers the TIRE reading (Right Tire); bare 'worn' doesn't consume 'tire', so the longer location key forms",
  },
  {
    input: "small dent on passenger side door",
    expected: { type: "dent", location: "Right Door" },
    note: "Case 2 — M4 Item 1: 'passenger side door' is now handed → Right Door (was null pre-Item-1)",
  },

  // --- Canonical anchors (known-good, span the location groups) -------
  {
    input: "oil leak on the belly",
    expected: { type: "oil_leak", location: "Fuselage" },
  },
  {
    input: "crack on the left wing",
    expected: { type: "crack", location: "Left Wing" },
  },
  {
    input: "corrosion near the left wing",
    expected: { type: "corrosion", location: "Left Wing" },
  },
  {
    input: "Tire worn on the right main",
    expected: { type: "tire_worn", location: "Right Main Gear" },
    note: "M4 Item 1: 'right main' (no 'tire') → the gear leg, Right Main Gear",
  },
  {
    input: "Some oil on the cowling today",
    expected: { type: "oil_leak", location: "Engine Cowl" },
    note: "M4 Item 1: 'cowling' now resolves to the precise Engine Cowl",
  },
  {
    input: "there's a vibration in the tail",
    expected: { type: "vibration", location: "Tail" },
  },
  {
    input: "flat tire on the nose gear",
    expected: { type: "flat_tire", location: "Nose Gear" },
    note: "M4 Item 1: 'nose gear' is now its own precise label",
  },
  {
    input: "unusual noise from the engine",
    expected: { type: "unusual_noise", location: "Engine Area" },
  },
  {
    input: "something feels off",
    expected: { type: "something_off", location: null },
  },
  {
    input: "lowered the spoilers on landing",
    expected: null,
    note: "word-boundary guard — bare 'oil' must not match inside 'spoilers'",
  },

  // --- M4 wish-list alias keywords (M3 release goodwill round) --------
  // One fixture per keyword added to ISSUE_KEYWORDS, plus a generic-
  // keyword edge case. Each maps to an existing slug — no new taxonomy.
  {
    input: "broken bracket on the left wing",
    expected: { type: "other", location: "Left Wing" },
    note: "alias — 'broken' is generic, maps to the catch-all 'other' slug",
  },
  {
    input: "torn seal near the tail",
    expected: { type: "other", location: "Tail" },
    note: "alias — 'torn' has no dedicated slug, maps to 'other'",
  },
  {
    input: "there's a scrape on the fuselage",
    expected: { type: "scratch", location: "Fuselage" },
    note: "alias — 'scrape' maps to the existing 'scratch' slug",
  },
  {
    input: "rock chips on the cowling",
    expected: { type: "scratch", location: "Engine Cowl" },
    note: "multi-word alias — 'rock chips' maps to 'scratch'; 'cowling' → Engine Cowl (M4 Item 1)",
  },
  {
    input: "the right main tire is low pressure",
    expected: { type: "tire_low", location: "Right Tire" },
    note: "'low pressure' → tire_low; 'right main tire' → Right Tire (M4 Item 1)",
  },
  {
    input: "chipped paint on the right wing",
    expected: { type: "scratch", location: "Right Wing" },
    note: "multi-word alias — 'chipped paint' maps to 'scratch'",
  },
  {
    input: "loose bracket on the right wing",
    expected: { type: "loose_panel", location: "Right Wing" },
    note: "alias — bare 'loose' maps to 'loose_panel'",
  },
  {
    input: "rusted bracket on the left wing",
    expected: { type: "corrosion", location: "Left Wing" },
    note: "alias — 'rusted' maps to the existing 'corrosion' slug",
  },
  {
    input: "something looks broken",
    expected: { type: "other", location: null },
    note: "edge case — generic 'broken' with no location resolves to the generic 'other' slug, never a wrong specific category",
  },

  // --- M4 Item 2 — new keywords (Raunek/Zach signed-off) --------------
  // One positive per genuinely-new keyword + adversarial negatives for
  // the false-positive-prone additions.
  {
    input: "transponder not working",
    expected: { type: "not_working", location: "Transponder" },
    note: "'not working' → not_working (Item 2); M4 Item 1 adds 'transponder' as a cockpit voice location → Transponder",
  },
  {
    input: "scratch on the right wing",
    expected: { type: "scratch", location: "Right Wing" },
    note: "NEW — bare 'scratch' was never a key (only scrape / rock chips / chipped paint reached the slug)",
  },
  {
    input: "leaking from the cowling",
    expected: { type: "leak_general", location: "Engine Cowl" },
    note: "'leaking' → leak_general (Item 2); 'cowling' → Engine Cowl (M4 Item 1)",
  },
  {
    input: "oil leaking near the belly",
    expected: { type: "oil_leak", location: "Fuselage" },
    note: "'oil leak' substring still wins via longest-match-first — 'oil leaking' stays oil_leak (also critical), not leak_general",
  },
  {
    input: "vibrating prop",
    expected: { type: "vibration", location: null },
    note: "NEW keyword 'vibrating' → vibration (critical); 'vibration' is not a substring of 'vibrating'",
  },
  {
    input: "soft brakes on the right",
    expected: { type: "brake_soft", location: null },
    note: "NEW keyword 'soft brakes' → brake_soft (critical); contiguous key was 'brake soft' (wrong word order)",
  },
  {
    input: "flickering avionics",
    expected: { type: "flicker", location: "Cockpit" },
    note: "'flickering' already extracts via substring of 'flicker'; locks it + the Cockpit pairing (flicker reclassified critical)",
  },
  {
    input: "hole in the fuselage",
    expected: { type: "hole", location: "Fuselage" },
    note: "NEW keyword 'hole' → hole (critical); word-bounded so it cannot match inside 'whole'",
  },
  {
    input: "damage on the left wing",
    expected: { type: "damage", location: "Left Wing" },
    note: "NEW keyword 'damage' → damage (critical) — emits because it pairs with a location",
  },

  // --- M4 Item 2 — adversarial negatives (must NOT extract) -----------
  {
    input: "no damage to report",
    expected: null,
    note: "'damage' is location-required (LOCATION_REQUIRED_KEYWORDS): unpaired → dropped, so the no-negation scanner doesn't emit a phantom critical issue",
  },
  {
    input: "checked for damage",
    expected: null,
    note: "'damage' unpaired (no nearby location) → dropped",
  },
  {
    input: "checked the whole wing",
    expected: null,
    note: "word-boundary guard — 'hole' must NOT match inside 'whole'; 'wing' alone is location-only → dropped",
  },
  {
    input: "brakes feel fine",
    expected: null,
    note: "no brake keyword matches ('brake wear' / 'brake soft' / 'soft brakes' are the only keys; bare 'brakes' is not one)",
  },

  // --- M4 Item 1 — location precision (Raunek/Zach signed-off) --------
  // Precise labels + L/R handedness + coarse fallbacks + picker-only.
  {
    input: "oil residue on the lower cowling",
    expected: { type: "oil_leak", location: "Lower Cowling" },
    note: "'lower cowling' is its own precise sub-region (distinct from Engine Cowl)",
  },
  {
    input: "crack in the windshield",
    expected: { type: "crack", location: "Windshield" },
    note: "NEW exterior location 'windshield'",
  },
  {
    input: "dent on the pilot side door",
    expected: { type: "dent", location: "Left Door" },
    note: "handed door — pilot side = Left Door",
  },
  {
    input: "crack on the left aileron",
    expected: { type: "crack", location: "Left Aileron" },
    note: "L/R proof (left) — handed control surface",
  },
  {
    input: "scratch on the right flap",
    expected: { type: "scratch", location: "Right Flap" },
    note: "L/R proof (right) — handed control surface",
  },
  {
    input: "there's a vibration in the vertical stabilizer",
    expected: { type: "vibration", location: "Vertical Stabilizer" },
    note: "tail surface precision — was coarse 'Tail', now its own label",
  },
  {
    input: "low pressure in the nose tire",
    expected: { type: "tire_low", location: "Nose Tire" },
    note: "precise landing-gear tire label",
  },
  {
    input: "altimeter not working",
    expected: { type: "not_working", location: "Altimeter" },
    note: "cockpit voice-subset instrument extracts as a location",
  },
  {
    input: "crack in the landing gear",
    expected: { type: "crack", location: "Landing Gear" },
    note: "coarse fallback still works (bare 'landing gear')",
  },
  {
    input: "vibration in the gear",
    expected: { type: "vibration", location: "Landing Gear" },
    note: "coarse fallback — bare 'gear' → Landing Gear (word-bounded, won't match 'gearbox')",
  },
  {
    input: "dent on the left wing and corrosion on the right wing",
    expected: { type: "dent", location: "Left Wing" },
    note: "multi-location L/R — each 'issue on side' clause pairs correctly (first = dent/Left Wing; second = corrosion/Right Wing)",
  },
  {
    input: "crack near the mixture control",
    expected: { type: "crack", location: null },
    note: "picker-only instrument 'mixture control' is NOT keyword-scanned → location stays null (no false pair)",
  },

  // --- M4 Item 1 — KNOWN LIMITATION (flagged, not silently shipped) ---
  // Multi-ISSUE L/R sentence where an issue keyword consumes the side
  // qualifier. "tire worn" (contiguous) consumes the "tire" token, so
  // "right main tire" → Right Tire can't form; the right side downgrades
  // to "right main" → Right Main Gear (leftward, dist 1), but the
  // intentional RIGHTWARD pairing bias instead grabs the trailing
  // "left main" → Left Main Gear (dist 2). Result: the worn tire is
  // reported on the WRONG side. Fixing requires reworking the pairing
  // bias (risks regressing the many "issue on location" cases) — deferred
  // beyond this session. Locked here so the wrong side is VISIBLE, and a
  // future fix becomes a deliberate change to this assertion.
  {
    input: "right main tire worn, left main looks low",
    expected: { type: "tire_worn", location: "Left Main Gear" },
    note: "⚠️ KNOWN LIMITATION (M4 Item 1): mis-pairs to the LEFT; should be the right tire. Flagged for a follow-up pairing-bias fix. ('left main looks low' yields no issue — 'low' alone is not a keyword.)",
  },
];

describe("extractIssues — fixture regression cases", () => {
  it.each(FIXTURES)(
    "$input",
    ({ input, expected }) => {
      const result = extractIssues(input);

      if (expected === null) {
        expect(result).toEqual([]);
        return;
      }

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toMatchObject({
        type_slug: expected.type,
        location: expected.location,
      });
    },
  );
});
