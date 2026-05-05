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

/** Issue keyword → issue_types.slug. Longest match wins on overlap. */
const ISSUE_KEYWORDS: Record<string, string> = {
  // ENGINE/OIL — note "oil on belly" / "oil on engine" are issue
  // keywords (not "oil leak" + "belly"); longest-match-first picks
  // them up as a single structured pair.
  "oil leak": "oil_leak",
  "oil on belly": "oil_on_belly",
  "oil on engine": "oil_on_engine",
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
};

/** Location keyword → canonical location label (matches the V1 spec
 *  groupings; multiple keywords can resolve to the same label). */
const LOCATION_KEYWORDS: Record<string, string> = {
  // Wings
  "left wing": "Left Wing",
  "left side wing": "Left Wing",
  "wing left": "Left Wing",
  "right wing": "Right Wing",
  "right side wing": "Right Wing",
  // Fuselage
  fuselage: "Fuselage",
  belly: "Fuselage",
  body: "Fuselage",
  // Engine area
  engine: "Engine Area",
  cowling: "Engine Area",
  front: "Engine Area",
  // Tail
  tail: "Tail",
  empennage: "Tail",
  "vertical stabilizer": "Tail",
  "horizontal stabilizer": "Tail",
  // Landing gear
  "nose gear": "Landing Gear",
  "main gear": "Landing Gear",
  "left main": "Landing Gear",
  "right main": "Landing Gear",
  // Cockpit
  panel: "Cockpit",
  avionics: "Cockpit",
  inside: "Cockpit",
};

/** Slug → human-readable issue name. Used to build summary strings
 *  without round-tripping to the database at extraction time. */
const ISSUE_NAME_BY_SLUG: Record<string, string> = {
  oil_leak: "Oil Leak",
  oil_on_belly: "Oil on Belly",
  oil_on_engine: "Oil on Engine",
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
 *  matches dominate single-word substrings ("oil on belly" beats
 *  "belly"; "left wing" beats "wing"). Returned once at module load. */
function sortedKeysDesc(table: Record<string, unknown>): string[] {
  return Object.keys(table).sort((a, b) => b.length - a.length);
}

const ISSUE_KEYS_DESC = sortedKeysDesc(ISSUE_KEYWORDS);
const LOCATION_KEYS_DESC = sortedKeysDesc(LOCATION_KEYWORDS);

/** Scan a normalized lowercased string for occurrences of any keyword
 *  in the table. Greedy: longer keys are matched first; once a span
 *  is consumed it can't be re-matched by a shorter overlapping key.
 *  Multiple disjoint occurrences of the same key are all returned. */
function scanKeywords<V>(
  text: string,
  table: Record<string, V>,
  keysDesc: string[],
): Match<V>[] {
  const matches: Match<V>[] = [];
  // consumed[i] === true → char index i is inside a longer match
  // already accepted. Skip indices that are consumed.
  const consumed = new Array<boolean>(text.length).fill(false);

  for (const key of keysDesc) {
    let from = 0;
    while (from < text.length) {
      const idx = text.indexOf(key, from);
      if (idx === -1) break;
      const end = idx + key.length;
      // Reject if any char in [idx, end) is already consumed.
      let collides = false;
      for (let i = idx; i < end; i++) {
        if (consumed[i]) {
          collides = true;
          break;
        }
      }
      if (!collides) {
        matches.push({ keyword: key, value: table[key], start: idx, end });
        for (let i = idx; i < end; i++) consumed[i] = true;
      }
      from = end;
    }
  }
  // Sort by start so callers see matches in transcript order.
  matches.sort((a, b) => a.start - b.start);
  return matches;
}

function buildSummary(slug: string, location: string | null): string {
  const name = ISSUE_NAME_BY_SLUG[slug] ?? slug;
  if (location) return `${name} observed on ${location}`;
  return `${name} observed (location not specified)`;
}

/**
 * Extract structured issues from a transcript per the V1 spec.
 *
 * Algorithm:
 *   1. Lowercase + collapse internal whitespace.
 *   2. Greedy-scan ISSUE_KEYWORDS (longest-first) for issue matches.
 *   3. Greedy-scan LOCATION_KEYWORDS over the unconsumed remainder
 *      for location matches.
 *   4. For each issue match, find the nearest location match within
 *      ±PAIR_WINDOW_CHARS by char distance; pair if found, else null.
 *   5. Build summary; deduplicate (slug, location) pairs (first wins).
 *   6. Return array. Locations alone are dropped — per spec they
 *      "store as note only" via voice_transcriptions.transcript_text.
 *
 * Pure function, no I/O, deterministic.
 */
export function extractIssues(transcript: string): ExtractedIssue[] {
  if (!transcript) return [];
  const text = transcript.toLowerCase().replace(/\s+/g, " ").trim();
  if (!text) return [];

  const issueMatches = scanKeywords(text, ISSUE_KEYWORDS, ISSUE_KEYS_DESC);
  if (issueMatches.length === 0) return [];

  const locationMatches = scanKeywords(
    text,
    LOCATION_KEYWORDS,
    LOCATION_KEYS_DESC,
  );

  const seen = new Set<string>();
  const out: ExtractedIssue[] = [];

  for (const issue of issueMatches) {
    let nearest: Match<string> | null = null;
    let nearestDist = Number.POSITIVE_INFINITY;
    for (const loc of locationMatches) {
      const dist = Math.abs(issue.start - loc.start);
      if (dist < nearestDist) {
        nearest = loc;
        nearestDist = dist;
      }
    }
    const location =
      nearest && nearestDist <= PAIR_WINDOW_CHARS ? nearest.value : null;

    const dedupeKey = `${issue.value}|${location ?? ""}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    out.push({
      type_slug: issue.value,
      location,
      summary: buildSummary(issue.value, location),
      raw_transcript: transcript,
    });
  }

  return out;
}

// Internal exports for unit tests. Not part of the public API.
export const __testing__ = {
  ISSUE_KEYWORDS,
  LOCATION_KEYWORDS,
  ISSUE_NAME_BY_SLUG,
  PAIR_WINDOW_CHARS,
};
