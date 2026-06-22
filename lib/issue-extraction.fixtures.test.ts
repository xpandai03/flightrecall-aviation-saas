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

type IssueExpect = { type: string; location: string | null };
type Fixture = {
  input: string;
  /** Expected FIRST issue, or null when no issue should extract. */
  expected?: IssueExpect | null;
  /** Expected FULL ordered issue list (item B multi-observation cases). */
  expectedAll?: IssueExpect[];
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
    expected: { type: "something_off", location: "Location Unknown" },
    note: "item B — no in-clause location → Location Unknown (was null)",
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
    expected: { type: "other", location: "Location Unknown" },
    note: "generic 'broken' → 'other'; no location → Location Unknown (item B; was null)",
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
    expected: { type: "vibration", location: "Location Unknown" },
    note: "'vibrating' → vibration; no location keyword ('prop' isn't one) → Location Unknown (item B; was null)",
  },
  {
    input: "soft brakes on the right",
    expected: { type: "brake_soft", location: "Location Unknown" },
    note: "'soft brakes' → brake_soft; bare 'right' isn't a location → Location Unknown (item B; was null)",
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
    expected: { type: "crack", location: "Location Unknown" },
    note: "picker-only 'mixture control' is NOT keyword-scanned → no location → Location Unknown (item B; was null — still no false pair)",
  },

  // --- item B — the M4 Item-1 known limitation is now FIXED by chunking ---
  // Previously this mis-paired to the LEFT (Left Main Gear) because the
  // global rightward bias grabbed the trailing "left main". With clause
  // segmentation the comma splits it: clause 1 "right main tire worn" pairs
  // within itself → Right Main Gear (correct SIDE); clause 2 "left main
  // looks low" yields no issue ("low" alone isn't a keyword). The
  // gear-vs-tire residual (the contiguous "tire worn" consumes "tire", so
  // "right main tire" → Right Tire can't form — OD4) is accepted.
  {
    input: "right main tire worn, left main looks low",
    expected: { type: "tire_worn", location: "Right Main Gear" },
    note: "item B FIX: chunking pairs within the comma-clause → correct side (Right Main Gear), no longer the wrong Left Main Gear",
  },

  // --- item B — chunk-based pairing (multi-observation) ---------------
  // The headline client failure: three observations in one note. Globally
  // these cross-assigned (tire→Right Door, dent→Left Wing, fuel→Right Tire);
  // chunking pairs each within its OWN clause.
  {
    input:
      "Right main tire looks worn, small dent on passenger side door, fuel smell near left wing root",
    expectedAll: [
      { type: "tire_worn", location: "Right Tire" },
      { type: "dent", location: "Right Door" },
      { type: "fuel_smell", location: "Left Wing" },
    ],
    note: "HEADLINE FIX — 3 observations, each paired within its own clause; no cross-assignment. ('left wing root' → Left Wing Root is item D.)",
  },
  {
    input: "landing light flickered during startup",
    expected: { type: "flicker", location: "Landing Light" },
    note: "item D added 'landing light' as a location → flicker/Landing Light (was Location Unknown pre-item-D)",
  },
  {
    input: "crack on the left wing or the right aileron",
    expected: { type: "crack", location: "Location Unknown" },
    note: "OD3 — a single-issue clause with ≥2 candidate locations (Left Wing + Right Aileron) is ambiguous → Location Unknown (don't guess; 'or' is not a delimiter)",
  },
  {
    input: "tire worn, fuel smell near left wing",
    expectedAll: [
      { type: "tire_worn", location: "Location Unknown" },
      { type: "fuel_smell", location: "Left Wing" },
    ],
    note: "no cross-clause grab — the 'tire worn' clause has no location → Location Unknown; the wing belongs only to the fuel-smell clause",
  },

  // --- item B — KNOWN RESIDUAL (OD2): no-delimiter run-on -------------
  // With NO punctuation the whole note is a single clause, so the old
  // global within-clause pairing can still mis-assign. Whisper almost
  // always punctuates clause boundaries, so this is an edge; locked here so
  // the residual is VISIBLE. Adding the comma fixes it (see HEADLINE above).
  {
    input: "right main tire looks worn small dent on passenger side door",
    expectedAll: [
      { type: "tire_worn", location: "Right Door" },
      { type: "dent", location: "Right Tire" },
    ],
    note: "⚠️ OD2 RESIDUAL: no delimiters → single clause → may mis-pair. Punctuated input pairs correctly. Issue-boundary sub-splitting deferred.",
  },

  // --- Item D — aviation vocabulary (the 4 client failing examples) ---
  {
    input: "pitot tube looks blocked",
    expected: { type: "obstruction", location: "Pitot Tube" },
    note: "Item D — 'blocked' → obstruction (critical); was [] (no verb keyword)",
  },
  {
    input: "altimeter is glitching",
    expected: { type: "instrument_fault", location: "Altimeter" },
    note: "Item D — 'glitch' (substring of glitching) → instrument_fault (critical); was []",
  },
  {
    input: "navigation light is out",
    expected: { type: "equipment_out", location: "Navigation Light" },
    note: "Item D — bare 'out' (short-keyword guarded: word-bounded + drop-if-unpaired) pairs with the new 'navigation light' location; was []",
  },
  {
    input: "GPS no transmit",
    expected: { type: "comm_fault", location: "GPS" },
    note: "Item D — 'no transmit' → comm_fault (critical); 'gps' added as a voice location; was []",
  },

  // --- Item D — more new verbs + locations ---------------------------
  {
    input: "transponder is frozen",
    expected: { type: "instrument_fault", location: "Transponder" },
    note: "'frozen' → instrument_fault",
  },
  {
    input: "airspeed indicator is inaccurate",
    expected: { type: "instrument_fault", location: "Airspeed Indicator" },
    note: "'inaccurate' → instrument_fault",
  },
  {
    input: "attitude indicator not responding",
    expected: { type: "instrument_fault", location: "Attitude Indicator" },
    note: "'not responding' → instrument_fault (distinct from 'not working' → not_working)",
  },
  {
    input: "obstructed static port",
    expected: { type: "obstruction", location: "Static Port" },
    note: "'obstructed' → obstruction; confirms the 'static port' LOCATION still forms (bare 'static' was deliberately NOT added)",
  },
  {
    input: "no receive on the radio",
    expected: { type: "comm_fault", location: "Location Unknown" },
    note: "'no receive' → comm_fault; no in-clause location keyword → Location Unknown",
  },
  {
    input: "getting radio static",
    expected: { type: "comm_fault", location: "Location Unknown" },
    note: "'radio static' phrase → comm_fault (bare 'static' omitted — collides with 'static port' + FP)",
  },
  {
    input: "landing light is out",
    expected: { type: "equipment_out", location: "Landing Light" },
    note: "Item D location 'landing light' + 'out' → equipment_out / Landing Light",
  },
  {
    input: "left navigation light is out",
    expected: { type: "equipment_out", location: "Left Navigation Light" },
    note: "handed nav light — 'left navigation light' wins over coarse 'navigation light' (longest-match-first)",
  },
  {
    input: "crack in the engine bay",
    expected: { type: "crack", location: "Engine Bay" },
    note: "Item D 'engine bay' precise label (longest-match-first beats coarse 'engine' → Engine Area)",
  },

  // --- Item D — false-positive guards (must NOT extract) -------------
  {
    input: "checked it out",
    expected: null,
    note: "'out' is a short keyword (≤3): word-bounded + dropped when unpaired (no location) → no equipment_out",
  },
  {
    input: "out of the hangar",
    expected: null,
    note: "'out' unpaired (no location keyword in clause) → dropped",
  },
  {
    input: "taxied out to the runway",
    expected: null,
    note: "'out' unpaired → dropped; 'runway' is not a location keyword",
  },
  {
    input: "static port looks fine",
    expected: null,
    note: "bare 'static' is NOT an issue keyword → no false comm_fault; 'static port' is location-only → dropped (no issue)",
  },

  // --- Phonetic correction (Whisper aviation mis-hearings) ------------
  // applyTranscriptionCorrections runs INSIDE extractIssues before the scan,
  // so a mis-heard term binds the right location. The original transcript is
  // preserved in raw_transcript (covered in transcription-corrections.test.ts).
  {
    input: "pilot tube looks blocked",
    expected: { type: "obstruction", location: "Pitot Tube" },
    note: "Whisper mishear 'pilot tube' → 'pitot tube' → Obstruction / Pitot Tube",
  },
  {
    input: "pedo tube looks blocked",
    expected: { type: "obstruction", location: "Pitot Tube" },
    note: "Whisper mishear 'pedo tube' → 'pitot tube' → Obstruction / Pitot Tube",
  },
  {
    input: "pitot tube looks blocked",
    expected: { type: "obstruction", location: "Pitot Tube" },
    note: "already-correct input unchanged → same result (no double-correction)",
  },
  // Adversarial: benign 'pilot'/'autopilot' speech must NOT be rewritten and
  // must NOT yield a spurious Pitot/Obstruction issue.
  {
    input: "the pilot taxied to the runway",
    expected: null,
    note: "adversarial: standalone 'pilot' never rewritten → no Pitot issue",
  },
  {
    input: "autopilot disengaged on downwind",
    expected: null,
    note: "adversarial: 'autopilot' never rewritten → no Pitot issue",
  },
  {
    input: "pilot error caused the go-around",
    expected: null,
    note: "adversarial: 'pilot error' untouched → no Pitot issue",
  },
];

describe("extractIssues — fixture regression cases", () => {
  it.each(FIXTURES)(
    "$input",
    ({ input, expected, expectedAll }) => {
      const result = extractIssues(input);

      // Multi-observation cases assert the FULL ordered list.
      if (expectedAll) {
        expect(result).toHaveLength(expectedAll.length);
        expectedAll.forEach((e, i) => {
          expect(result[i]).toMatchObject({
            type_slug: e.type,
            location: e.location,
          });
        });
        return;
      }

      // `expected: null` (or omitted) → nothing should extract.
      if (!expected) {
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
