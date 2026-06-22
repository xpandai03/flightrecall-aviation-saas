/**
 * Deterministic keyword + location pairer for voice transcripts.
 *
 * V1 spec: this is NOT AI. No LLM, no embedding, no probabilistic
 * scoring. Pure substring scan of the transcript against the keyword
 * tables below, plus a closest-by-character-distance pairing rule.
 *
 * Tables (ISSUE_KEYWORDS, LOCATION_KEYWORDS, ISSUE_NAME_BY_SLUG) are
 * the canonical V1 vocabulary copied verbatim from Zach Boone's spec
 * (April 30, 2026 doc). The slugs match issue_types.slug values
 * created by supabase/migrations/20260505200000_m5_issue_taxonomy_expansion.sql.
 *
 * Known V1 limitations (out of scope for this phase):
 *  - No negation handling. "no oil leak today" matches "oil leak".
 *  - No fuzzy matching. Misspelled keywords are missed.
 *  - No re-extraction on transcript edit (Phase 3 may revisit).
 */

import { applyTranscriptionCorrections } from "@/lib/transcription-corrections";

export type ExtractedIssue = {
  /** Slug from issue_types.slug — canonical taxonomy ID. */
  type_slug: string;
  /** Canonical location label, or null when unpaired. */
  location: string | null;
  /** Pre-formatted human-readable phrase. */
  summary: string;
  /** The verbatim transcript this issue was extracted from. */
  raw_transcript: string;
};

/** Pairing window in characters: an issue keyword pairs with the
 *  nearest location keyword within ±this distance. Tunable. */
const PAIR_WINDOW_CHARS = 50;

/** Low-confidence location label (item B). When a clause's issue has no
 *  in-clause location (or an ambiguous ≥2-location clause), we emit this
 *  instead of guessing or borrowing another clause's location — a WRONG
 *  location is worse than a MISSING one. Emitted issues never carry a null
 *  location anymore: a real label or this string. (issues.location is free
 *  text, so this needs no schema change.) */
const LOCATION_UNKNOWN = "Location Unknown";

/** Keywords at or below this length must be word-bounded on both sides
 *  during scanning (so bare "oil" doesn't match inside "spoiler" or
 *  "boiling") and are dropped from the issue output if they fail to
 *  pair with a nearby location (so "the oil pressure looks normal"
 *  doesn't emit a phantom oil_leak). Multi-word phrases like
 *  "oil leak" are unaffected — explicit phrases emit with or without
 *  a paired location. */
const SHORT_KEYWORD_MAX_LEN = 3;

/** Keywords that must be word-bounded on BOTH sides regardless of length.
 *  The length-based guard only covers keys ≤ SHORT_KEYWORD_MAX_LEN, so a
 *  longer key that is a substring of a common word must be listed here.
 *  - M4 Item 2 (issue keys): "hole"/"holes" vs "whole"/"wholesale".
 *  - M4 Item 1 (location keys): "gear" vs "gearbox"; "cowl" vs "scowl";
 *    "door"/"doors" vs "indoor"/"outdoors"; "yoke" vs "yokel"; "cabin"
 *    vs "cabinet". Each still matches as a standalone word. */
const WORD_BOUNDED_KEYWORDS = new Set<string>([
  "hole",
  "holes",
  "gear",
  "cowl",
  "door",
  "doors",
  "yoke",
  "cabin",
]);

/** Keywords dropped when they fail to pair with a nearby location,
 *  regardless of length. "damage" is too generic to emit unpaired: with
 *  no negation handling, "no damage to report" / "checked for damage"
 *  would otherwise create phantom critical issues. Requiring a nearby
 *  location keyword is the minimal safe gate (M4 Item 2). Mirrors the
 *  unpaired-drop rule short keywords already get. */
const LOCATION_REQUIRED_KEYWORDS = new Set<string>(["damage"]);

/** Issue keyword → issue_types.slug. Longest match wins on overlap.
 *  Compound issue+location keys (e.g. "oil on belly") are deliberately
 *  absent: the location pairer below decomposes them into base issue
 *  + location at extraction time. */
const ISSUE_KEYWORDS: Record<string, string> = {
  // ENGINE/OIL — bare "oil" handles natural Whisper transcripts
  // ("oil on the belly") that filler words like "the" would otherwise
  // break. The compound oil_on_belly/oil_on_engine slugs were dropped
  // in the M5 #2 corrective patch; pairing yields oil_leak + Fuselage
  // / Engine Area instead.
  "oil leak": "oil_leak",
  oil: "oil_leak",
  "oil low": "oil_low",
  "oil dirty": "oil_dirty",
  // STRUCTURAL
  crack: "crack",
  corrosion: "corrosion",
  dent: "dent",
  "loose panel": "loose_panel",
  "missing fastener": "missing_fastener",
  // LANDING GEAR / TIRES
  "tire low": "tire_low",
  "tire worn": "tire_worn",
  // Bare "worn" catches natural phrasings the contiguous "tire worn"
  // phrase misses ("tire looks worn", "tire is worn", "right main tire
  // ... worn"). Without it the worn-tire issue is dropped entirely AND
  // its location is left unclaimed for a neighbouring issue keyword to
  // mis-pair across the window. Longest-match-first still lets the
  // explicit "tire worn" phrase win where the words are contiguous.
  // V1 imprecision: a non-tire "worn" (e.g. "brake worn") also reads
  // as tire_worn — acceptable until the M4 vocabulary expansion.
  worn: "tire_worn",
  "flat tire": "flat_tire",
  "brake wear": "brake_wear",
  "brake soft": "brake_soft",
  // FUEL
  "fuel leak": "fuel_leak",
  "fuel smell": "fuel_smell",
  "cap loose": "cap_loose",
  "fuel contamination": "fuel_contamination",
  // ELECTRICAL
  flicker: "flicker",
  "avionics reset": "avionics_reset",
  "low voltage": "low_voltage",
  "battery weak": "battery_weak",
  // FLIGHT CONTROLS
  "stiff control": "stiff_control",
  "unusual resistance": "unusual_resistance",
  "cable issue": "cable_issue",
  binding: "binding",
  // GENERAL/SAFETY
  vibration: "vibration",
  "unusual noise": "unusual_noise",
  "rough engine": "rough_engine",
  "something feels off": "something_off",
  // --- M4 wish-list aliases (M3 release goodwill round) --------------
  // Eight keywords from Zach's M4 list, each mapped to an EXISTING slug
  // (no new issue_types, no migration). Aliases only — the full M4
  // vocabulary expansion stays out of scope. Two of the requested ten
  // were withheld: "damage" (mass false-positive risk under V1's
  // no-negation scan — "no damage" / "checked for damage" would emit
  // phantom issues) and "hole" (substring of the common word "whole";
  // the word-boundary guard only covers keys <= SHORT_KEYWORD_MAX_LEN,
  // so a 4-char "hole" cannot be added safely until M4 extends
  // boundary checks to longer keys).
  broken: "other",
  torn: "other",
  scrape: "scratch",
  "rock chips": "scratch",
  "low pressure": "tire_low",
  "chipped paint": "scratch",
  // Bare "loose" catches "panel is loose" / "loose bracket" the way
  // bare "worn" catches non-contiguous tire-worn phrasings; the
  // contiguous "loose panel" and "cap loose" keys still win via
  // longest-match-first. V1 imprecision: a non-panel "loose" reads as
  // loose_panel — acceptable, mirrors the worn -> tire_worn tradeoff.
  loose: "loose_panel",
  rusted: "corrosion",
  // --- M4 Item 2 — keyword expansion (Raunek/Zach signed-off) ---------
  // Per M4-punchlist-plan.md §Item 2.2. Four NEW generic-critical issue
  // types (leak_general, not_working, damage, hole) are introduced rather
  // than flipping the cosmetic catch-all "other" to critical — the latter
  // would silently contradict the signed-off broken/torn = monitor
  // decisions (both map to "other"). Severities live in BOTH
  // lib/issue-taxonomy.ts SEVERITY_MAP AND migration
  // 20260602120000_m4_keyword_expansion_severities.sql (sync rule).
  "not working": "not_working",
  // Bare "scratch" was never a key — only scrape / rock chips / chipped
  // paint reached the scratch slug. Add the literal word (stays cosmetic).
  scratch: "scratch",
  // Generic leak. "oil leak" / "fuel leak" still win via longest-match-
  // first; bare "leaking" (no oil/fuel prefix) maps to the generic type.
  leaking: "leak_general",
  // "vibration" is NOT a substring of "vibrating" (vibrat-ion vs
  // vibrat-ing), so the present-tense form was missed.
  vibrating: "vibration",
  // The contiguous key is "brake soft"; pilots also say "soft brakes".
  "soft brakes": "brake_soft",
  // Withheld in M3 for false positives; now added behind guards:
  //  - "damage" is in LOCATION_REQUIRED_KEYWORDS (dropped when unpaired)
  //    so "no damage to report" / "checked for damage" do not emit.
  //  - "hole"/"holes" are in WORD_BOUNDED_KEYWORDS so "whole"/"wholesale"
  //    do not match.
  damage: "damage",
  hole: "hole",
  holes: "hole",
  // --- Item D — aviation vocabulary pass (Raunek/Zach signed-off) -----
  // Client-enumerated terms that produced NOTHING (audit GROUP B2/D): the
  // issue VERB was missing, so location-only phrases were dropped. Four NEW
  // critical issue types (obstruction, instrument_fault, comm_fault,
  // equipment_out); severities in BOTH SEVERITY_MAP and migration
  // 20260611140000_item_d_aviation_vocabulary.sql (sync rule). Bias =
  // critical when ambiguous.
  //
  // BLOCKAGE — a blocked pitot/static is a serious airspeed hazard.
  blocked: "obstruction",
  obstructed: "obstruction",
  // INSTRUMENT MALFUNCTION — an unreliable instrument is safety-critical.
  // "glitch" covers glitching/glitches via substring.
  glitch: "instrument_fault",
  frozen: "instrument_fault",
  inaccurate: "instrument_fault",
  intermittent: "instrument_fault",
  // Distinct from "not working" (→ not_working) per the audit caveat.
  "not responding": "instrument_fault",
  // RADIO / COMM FAILURE.
  "no transmit": "comm_fault",
  "no receive": "comm_fault",
  // Bare "static" is intentionally NOT a key: it collides with the
  // "static port" LOCATION (the issue pass would consume "static" and
  // break that location) and FPs on benign speech ("stood static"). The
  // "radio static" phrase captures the comm case safely. (Flagged: broader
  // static phrasings — "GPS static", bare "static" — remain a follow-up.)
  "radio static": "comm_fault",
  // EQUIPMENT / LIGHT OUT. Bare "out" is safe via the EXISTING short-keyword
  // guards: ≤ SHORT_KEYWORD_MAX_LEN(3) → word-bounded on scan ("without",
  // "throughout", "outside" never match) AND dropped when it fails to pair
  // with a nearby location ("checked it out", "out of the hangar" → no
  // location in clause → dropped). It only emits when paired with a
  // light/equipment location in its own clause ("navigation light is out").
  out: "equipment_out",
};

/** Location keyword → canonical location label (M4 Item 1, Raunek/Zach
 *  signed-off; see M4-punchlist-plan.md §Item 1). Multiple keywords can
 *  resolve to the same label. Longest-match-first (sortedKeysDesc) makes
 *  precise multi-word cues win over their coarse components ("right main
 *  tire" beats "right main"; "engine cowling" beats "engine"/"cowling").
 *
 *  Every value here MUST also appear in LOCATION_LABELS (lib/issue-
 *  taxonomy.ts). LOCATION_LABELS additionally carries PICKER-ONLY cockpit
 *  instruments that are deliberately absent here — short/ambiguous panel
 *  words ("clock", "panel") would flood the substring scanner with false
 *  positives, so they are manual-select only. */
const LOCATION_KEYWORDS: Record<string, string> = {
  // --- Wings + control surfaces --------------------------------------
  "left wing tip": "Left Wing Tip",
  "right wing tip": "Right Wing Tip",
  "left wingtip": "Left Wing Tip",
  "right wingtip": "Right Wing Tip",
  "left wing": "Left Wing",
  "left side wing": "Left Wing",
  "wing left": "Left Wing",
  "right wing": "Right Wing",
  "right side wing": "Right Wing",
  "wing strut": "Wing Strut",
  "left aileron": "Left Aileron",
  "right aileron": "Right Aileron",
  "left flap": "Left Flap",
  "right flap": "Right Flap",
  // --- Fuselage / cabin / doors --------------------------------------
  fuselage: "Fuselage",
  belly: "Fuselage",
  body: "Fuselage",
  cabin: "Cabin",
  windshield: "Windshield",
  "static port": "Static Port",
  "pitot tube": "Pitot Tube",
  pitot: "Pitot Tube",
  antennas: "Antennas",
  antenna: "Antennas",
  // Doors are handed: passenger = right, pilot = left. Bare "door"/"doors"
  // fall back to a coarse "Door" (word-bounded — see WORD_BOUNDED_KEYWORDS
  // — so "indoor"/"outdoors" don't mis-trigger).
  "passenger side door": "Right Door",
  "passenger door": "Right Door",
  "passenger side": "Right Door",
  "pilot side door": "Left Door",
  "pilot door": "Left Door",
  "pilot side": "Left Door",
  "left door": "Left Door",
  "right door": "Right Door",
  door: "Door",
  doors: "Door",
  // --- Engine / nose -------------------------------------------------
  // "Engine Cowl" is canonical; cowling/cowl/engine cowling are synonyms.
  // "lower cowling" is its own precise sub-region. Bare "engine"/"front"
  // stay on the coarse Engine Area zone (unchanged) to preserve existing
  // extractions.
  "engine cowling": "Engine Cowl",
  "engine cowl": "Engine Cowl",
  "lower cowling": "Lower Cowling",
  "lower cowl": "Lower Cowling",
  cowling: "Engine Cowl",
  cowl: "Engine Cowl",
  propeller: "Propeller",
  // "engine bay" is a precise label distinct from the coarse Engine Area;
  // longest-match-first lets it win over bare "engine".
  "engine bay": "Engine Bay",
  engine: "Engine Area",
  front: "Engine Area",
  // --- Tail / empennage ----------------------------------------------
  // "empennage" is a synonym for the coarse Tail; specific surfaces get
  // their own labels.
  "vertical stabilizer": "Vertical Stabilizer",
  "horizontal stabilizer": "Horizontal Stabilizer",
  "trim tab": "Trim Tab",
  rudder: "Rudder",
  elevator: "Elevator",
  tail: "Tail",
  empennage: "Tail",
  // --- Landing gear (precise; coarse fallback for bare gear) ---------
  // "right main tire"/"left main tire" prefer the TIRE reading (the
  // longer key wins via longest-match-first) — Zach distinguishes a worn
  // tire from the gear leg. "right main"/"left main" (no "tire") resolve
  // to the gear leg. Bare "gear"/"main gear"/"landing gear" → coarse.
  "right main tire": "Right Tire",
  "left main tire": "Left Tire",
  "right main gear": "Right Main Gear",
  "left main gear": "Left Main Gear",
  "right main": "Right Main Gear",
  "left main": "Left Main Gear",
  "nose tire": "Nose Tire",
  "right tire": "Right Tire",
  "left tire": "Left Tire",
  "nose gear": "Nose Gear",
  "nose wheel": "Nose Gear",
  "main gear": "Landing Gear",
  "landing gear": "Landing Gear",
  gear: "Landing Gear",
  // --- Cockpit (curated voice subset + coarse catch-all) -------------
  // Voice-extractable instruments only. The rest of the 46-item panel is
  // PICKER-ONLY (LOCATION_LABELS, not here).
  "annunciator panel": "Annunciator Panel",
  annunciator: "Annunciator Panel",
  "attitude indicator": "Attitude Indicator",
  "airspeed indicator": "Airspeed Indicator",
  airspeed: "Airspeed Indicator",
  altimeter: "Altimeter",
  transponder: "Transponder",
  autopilot: "Autopilot",
  "parking brake": "Parking Brake",
  "angle of attack indicator": "Angle of Attack Indicator",
  "angle of attack": "Angle of Attack Indicator",
  yoke: "Yoke",
  cockpit: "Cockpit",
  panel: "Cockpit",
  avionics: "Cockpit",
  inside: "Cockpit",
  // --- Item D — lights + GPS (client-enumerated) ---------------------
  // Exterior lights. Navigation lights are handed; bare "navigation
  // light"/"nav light" → coarse Navigation Light (the client's example
  // "navigation light is out" gives no side). Longest-match-first lets the
  // handed/side keys win over the coarse one.
  "front navigation light": "Front Navigation Light",
  "left navigation light": "Left Navigation Light",
  "right navigation light": "Right Navigation Light",
  "front nav light": "Front Navigation Light",
  "left nav light": "Left Navigation Light",
  "right nav light": "Right Navigation Light",
  "navigation light": "Navigation Light",
  "nav light": "Navigation Light",
  "landing lights": "Landing Light",
  "landing light": "Landing Light",
  // GPS as a voice location so "GPS no transmit" pairs to GPS (the long
  // "GPS and Nav/Com Radio 1" picker label stays separate).
  gps: "GPS",
};

/** Slug → human-readable issue name. Used to build summary strings
 *  without round-tripping to the database at extraction time. */
const ISSUE_NAME_BY_SLUG: Record<string, string> = {
  oil_leak: "Oil Leak",
  oil_low: "Oil Low",
  oil_dirty: "Oil Dirty",
  crack: "Crack",
  corrosion: "Corrosion",
  dent: "Dent",
  loose_panel: "Loose Panel",
  missing_fastener: "Missing Fastener",
  tire_low: "Tire Low",
  tire_worn: "Tire Worn",
  flat_tire: "Flat Tire",
  brake_wear: "Brake Wear",
  brake_soft: "Brake Soft",
  fuel_leak: "Fuel Leak",
  fuel_smell: "Fuel Smell",
  cap_loose: "Fuel Cap Loose",
  fuel_contamination: "Fuel Contamination",
  flicker: "Electrical Flicker",
  avionics_reset: "Avionics Reset",
  low_voltage: "Low Voltage",
  battery_weak: "Battery Weak",
  stiff_control: "Stiff Control",
  unusual_resistance: "Unusual Resistance",
  cable_issue: "Cable Issue",
  binding: "Binding",
  vibration: "Vibration",
  unusual_noise: "Unusual Noise",
  rough_engine: "Rough Engine",
  something_off: "Something Feels Off",
  // M4 Item 2 — new generic-critical types.
  leak_general: "General Leak",
  not_working: "Not Working",
  damage: "Damage",
  hole: "Hole",
  // Item D — aviation vocabulary new types.
  obstruction: "Obstruction",
  instrument_fault: "Instrument Fault",
  comm_fault: "Comm Fault",
  equipment_out: "Equipment Out",
  // Legacy quick-tag slugs reachable via the M4 wish-list aliases above.
  scratch: "Scratch",
  other: "Other",
};

type Match<V> = {
  /** The matched keyword as it appears in the table. */
  keyword: string;
  /** Mapped value (slug for issues, label for locations). */
  value: V;
  /** Char index of the start of the match in the lowercased text. */
  start: number;
  /** Char index of the end of the match (exclusive). */
  end: number;
};

/** Sort the keys of a keyword table longest-first so multi-word
 *  matches dominate single-word substrings ("oil leak" beats bare
 *  "oil"; "left wing" beats "wing"). Returned once at module load. */
function sortedKeysDesc(table: Record<string, unknown>): string[] {
  return Object.keys(table).sort((a, b) => b.length - a.length);
}

const ISSUE_KEYS_DESC = sortedKeysDesc(ISSUE_KEYWORDS);
const LOCATION_KEYS_DESC = sortedKeysDesc(LOCATION_KEYWORDS);

function isWordChar(ch: string): boolean {
  return /[a-z0-9]/.test(ch);
}

/** Scan a normalized lowercased string for occurrences of any keyword
 *  in the table. Greedy: longer keys match first; spans already in
 *  `consumed` are skipped, and accepted matches mark their span as
 *  consumed in place. Keys at or below SHORT_KEYWORD_MAX_LEN must be
 *  word-bounded on both sides so bare "oil" doesn't match inside
 *  "spoiler" or "boiling". The two-pass extractor passes its
 *  issue-pass consumed map into the location pass so a location word
 *  embedded in an issue match can't double-count. */
function scanKeywords<V>(
  text: string,
  table: Record<string, V>,
  keysDesc: string[],
  consumed: boolean[],
): Match<V>[] {
  const matches: Match<V>[] = [];

  for (const key of keysDesc) {
    const requireWordBoundary =
      key.length <= SHORT_KEYWORD_MAX_LEN || WORD_BOUNDED_KEYWORDS.has(key);
    let from = 0;
    while (from < text.length) {
      const idx = text.indexOf(key, from);
      if (idx === -1) break;
      const end = idx + key.length;
      let skip = false;
      for (let i = idx; i < end; i++) {
        if (consumed[i]) {
          skip = true;
          break;
        }
      }
      if (!skip && requireWordBoundary) {
        const before = idx > 0 ? text[idx - 1] : "";
        const after = end < text.length ? text[end] : "";
        if ((before && isWordChar(before)) || (after && isWordChar(after))) {
          skip = true;
        }
      }
      if (!skip) {
        matches.push({ keyword: key, value: table[key], start: idx, end });
        for (let i = idx; i < end; i++) consumed[i] = true;
      }
      from = end;
    }
  }
  matches.sort((a, b) => a.start - b.start);
  return matches;
}

function buildSummary(slug: string, location: string | null): string {
  const name = ISSUE_NAME_BY_SLUG[slug] ?? slug;
  if (location === LOCATION_UNKNOWN) return `${name} observed (location unknown)`;
  if (location) return `${name} observed on ${location}`;
  return `${name} observed (location not specified)`;
}

/**
 * Split a normalized transcript into clause segments (item B chunking).
 *
 * Deterministic — no AI. Splits on HARD delimiters ( , ; . ! ? ) and the
 * word-bounded conjunctions " and " / " then " (the surrounding spaces make
 * them word-bounded, so "errand" / "android" never split). Trims each
 * segment and drops empties.
 *
 * Each clause is then extracted in ISOLATION (issue + location scoped to the
 * clause), so an issue can never pair to a location in a different
 * observation — the fix for multi-observation cross-assignment. A run-on
 * with no delimiters yields a single clause (today's behavior, no worse).
 */
export function splitIntoClauses(text: string): string[] {
  return text
    .split(/[,;.!?]+|\s+(?:and|then)\s+/)
    .map((clause) => clause.trim())
    .filter((clause) => clause.length > 0);
}

/**
 * Extract structured issues from a transcript (item B — chunk-based pairing).
 *
 * Algorithm:
 *   1. Lowercase + collapse internal whitespace.
 *   2. Split into CLAUSE segments (splitIntoClauses). Each clause is one
 *      observation; pairing is scoped to a clause so an issue can NEVER
 *      reach another observation's location (the multi-observation fix).
 *   3. Per clause:
 *        a. Issue-pass: greedy-scan ISSUE_KEYWORDS (longest-first); accepted
 *           matches mark their char-range as consumed.
 *        b. Location-pass: greedy-scan LOCATION_KEYWORDS over the SAME
 *           consumed map (so a location word inside an issue match can't
 *           double-count — kept by design, OD4).
 *        c. Pairing — for each issue, nearest unclaimed location: rightward
 *           first (start ≥ issue.end), else leftward (end ≤ issue.start),
 *           within PAIR_WINDOW_CHARS, then claimed.
 *        d. Low-confidence → "Location Unknown" rather than a guess: a
 *           single-issue clause with ≥2 candidate locations is ambiguous, and
 *           an emitted issue with no in-clause location gets the label.
 *           (Short / LOCATION_REQUIRED keywords with no location are still
 *           DROPPED — unchanged — before any label is assigned.)
 *   4. Dedupe (slug, location) across all clauses — first wins.
 *   5. Emitted issues never carry a null location (a real label or
 *      "Location Unknown"). raw_transcript stays the WHOLE note (OD5).
 *
 * Pure function, no I/O, deterministic. Single-observation transcripts (no
 * delimiters) are one clause → behavior is byte-identical to before, except
 * a previously-null location now reads "Location Unknown".
 */
export function extractIssues(transcript: string): ExtractedIssue[] {
  if (!transcript) return [];
  // Phonetic-correction layer: fix KNOWN Whisper mis-hearings of aviation
  // jargon (e.g. "pilot tube" → "pitot tube") so the location binds. This
  // feeds the scanner ONLY — `transcript` (the original Whisper output) is
  // still what we store in raw_transcript below, so the user-visible
  // transcript is never silently rewritten. See lib/transcription-corrections.ts.
  const corrected = applyTranscriptionCorrections(transcript);
  const text = corrected.toLowerCase().replace(/\s+/g, " ").trim();
  if (!text) return [];

  const seen = new Set<string>();
  const out: ExtractedIssue[] = [];

  for (const clause of splitIntoClauses(text)) {
    const consumed = new Array<boolean>(clause.length).fill(false);

    const issueMatches = scanKeywords(
      clause,
      ISSUE_KEYWORDS,
      ISSUE_KEYS_DESC,
      consumed,
    );
    if (issueMatches.length === 0) continue;

    const locationMatches = scanKeywords(
      clause,
      LOCATION_KEYWORDS,
      LOCATION_KEYS_DESC,
      consumed,
    );

    // A clause with a SINGLE issue and ≥2 candidate locations is ambiguous —
    // don't guess which (OD3). Skip pairing so the issue resolves to
    // "Location Unknown" (or drops, if a short/location-required keyword).
    const ambiguousSingle =
      issueMatches.length === 1 && locationMatches.length >= 2;

    const claimedLocs = new Set<number>();

    for (const issue of issueMatches) {
      let location: string | null = null;

      if (!ambiguousSingle) {
        let pickedIdx = -1;
        let bestDist = Number.POSITIVE_INFINITY;

        // Look right first: nearest unclaimed location starting after this
        // issue's end, within the window (scoped to the clause).
        for (let i = 0; i < locationMatches.length; i++) {
          if (claimedLocs.has(i)) continue;
          const loc = locationMatches[i];
          if (loc.start < issue.end) continue;
          const dist = loc.start - issue.end;
          if (dist <= PAIR_WINDOW_CHARS && dist < bestDist) {
            pickedIdx = i;
            bestDist = dist;
          }
        }

        // No rightward match? Fall back to leftward.
        if (pickedIdx === -1) {
          for (let i = 0; i < locationMatches.length; i++) {
            if (claimedLocs.has(i)) continue;
            const loc = locationMatches[i];
            if (loc.end > issue.start) continue;
            const dist = issue.start - loc.end;
            if (dist <= PAIR_WINDOW_CHARS && dist < bestDist) {
              pickedIdx = i;
              bestDist = dist;
            }
          }
        }

        if (pickedIdx !== -1) {
          claimedLocs.add(pickedIdx);
          location = locationMatches[pickedIdx].value;
        }
      }

      // Drop rule (unchanged): an unpaired short / LOCATION_REQUIRED keyword
      // is too ambiguous to emit — drop it BEFORE the Location-Unknown label.
      if (
        location === null &&
        (issue.keyword.length <= SHORT_KEYWORD_MAX_LEN ||
          LOCATION_REQUIRED_KEYWORDS.has(issue.keyword))
      ) {
        continue;
      }

      // OD1: emitted issues never carry a null location.
      const emittedLocation = location ?? LOCATION_UNKNOWN;

      const dedupeKey = `${issue.value}|${emittedLocation}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      out.push({
        type_slug: issue.value,
        location: emittedLocation,
        summary: buildSummary(issue.value, emittedLocation),
        raw_transcript: transcript,
      });
    }
  }

  return out;
}

// Internal exports for unit tests. Not part of the public API.
export const __testing__ = {
  ISSUE_KEYWORDS,
  LOCATION_KEYWORDS,
  ISSUE_NAME_BY_SLUG,
  PAIR_WINDOW_CHARS,
  SHORT_KEYWORD_MAX_LEN,
  LOCATION_UNKNOWN,
};
