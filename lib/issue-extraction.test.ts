import { describe, expect, it } from "vitest";

import { __testing__, extractIssues } from "@/lib/issue-extraction";
import {
  getSeverityForSlug,
  LOCATION_LABELS,
  SEVERITY_MAP,
} from "@/lib/issue-taxonomy";

/**
 * Tests-as-spec for the V1 keyword extraction logic.
 *
 * Each describe block maps directly to a happy-path or edge-case
 * scenario from the M2 Phase 2 prompt + Zach's V1 detection spec.
 * If any of these break in the future, the change is breaking the
 * client's extraction contract — surface it before merging.
 */

describe("extractIssues — happy path: two issues at two locations", () => {
  it("pairs each issue with its nearest in-window location", () => {
    const transcript =
      "checking the aircraft, see oil leak on the belly, also corrosion on the left wing root";

    const result = extractIssues(transcript);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      type_slug: "oil_leak",
      location: "Fuselage",
      summary: "Oil Leak observed on Fuselage",
      raw_transcript: transcript,
    });
    expect(result[1]).toMatchObject({
      type_slug: "corrosion",
      location: "Left Wing",
      summary: "Corrosion observed on Left Wing",
    });
  });
});

describe("extractIssues — issue without location (fallback path)", () => {
  it("returns the issue with 'Location Unknown' and the (location unknown) summary", () => {
    const transcript = "something feels off";
    const result = extractIssues(transcript);
    expect(result).toEqual([
      {
        type_slug: "something_off",
        // item B: emitted issues never carry null location anymore.
        location: "Location Unknown",
        summary: "Something Feels Off observed (location unknown)",
        raw_transcript: transcript,
      },
    ]);
  });
});

describe("extractIssues — location without issue (fallback: drop entirely)", () => {
  it("returns empty array when only location keywords match", () => {
    expect(extractIssues("checked the cowling, all good")).toEqual([]);
    expect(extractIssues("looked at the left wing")).toEqual([]);
  });
});

describe("extractIssues — same issue type at different locations", () => {
  it("emits two distinct issues differentiated by location", () => {
    const transcript =
      "oil leak on the belly, also oil leak near the engine cowling";
    const result = extractIssues(transcript);

    expect(result).toHaveLength(2);
    const slugs = result.map((r) => r.type_slug);
    const locations = result.map((r) => r.location);

    expect(slugs).toEqual(["oil_leak", "oil_leak"]);
    expect(locations).toContain("Fuselage");
    // M4 Item 1: "engine cowling" now resolves to the precise Engine Cowl.
    expect(locations).toContain("Engine Cowl");
  });
});

describe("extractIssues — duplicate (slug, location) within one transcript", () => {
  it("collapses duplicates; first occurrence wins", () => {
    const transcript = "oil leak on belly, and again oil leak on belly";
    const result = extractIssues(transcript);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type_slug: "oil_leak",
      location: "Fuselage",
    });
  });
});

describe("extractIssues — no keywords at all", () => {
  it("returns empty array for irrelevant transcripts", () => {
    expect(extractIssues("the weather looks great today")).toEqual([]);
    expect(extractIssues("")).toEqual([]);
    expect(extractIssues("   ")).toEqual([]);
  });
});

describe("extractIssues — pairing window (50 chars)", () => {
  it("pairs when location is within ±50 chars of the issue keyword", () => {
    // ~12 chars between issue end and location start
    const close = "oil leak on the belly today";
    const result = extractIssues(close);
    expect(result[0]?.location).toBe("Fuselage");
  });

  it("does not pair when the only location is beyond the window", () => {
    // Filler keeps location > 50 chars from the issue keyword
    const filler =
      "and many other things happened that are not relevant to anything,";
    const transcript = `oil leak ${filler} ${filler} on the belly`;
    const result = extractIssues(transcript);
    expect(result).toHaveLength(1);
    expect(result[0].type_slug).toBe("oil_leak");
    // item B: the filler's commas/"and" split this into clauses, so "oil
    // leak" never reaches "belly" → Location Unknown (was null via the
    // 50-char window). Either way: no wrong location is borrowed.
    expect(result[0].location).toBe("Location Unknown");
  });
});

describe("extractIssues — longest-match-first dominates substring overlap", () => {
  it("'oil leak' beats bare 'oil' on overlap (longest-first)", () => {
    // Both "oil leak" (slug=oil_leak) and bare "oil" (slug=oil_leak)
    // are issue keywords; longest-match-first ensures the explicit
    // phrase consumes the span before bare "oil" gets to scan it.
    const result = extractIssues("see oil leak on the belly");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type_slug: "oil_leak",
      location: "Fuselage",
    });
  });

  it("'left wing' beats standalone 'wing' (which isn't a key anyway)", () => {
    const result = extractIssues("crack on the left wing");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type_slug: "crack",
      location: "Left Wing",
    });
  });
});

describe("extractIssues — case insensitivity + whitespace tolerance", () => {
  it("normalizes mixed case and collapses whitespace", () => {
    const transcript = "OIL    LEAK   on  the   BELLY";
    const result = extractIssues(transcript);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type_slug: "oil_leak",
      location: "Fuselage",
    });
  });
});

describe("extractIssues — raw_transcript preserves original input verbatim", () => {
  it("stores transcript exactly as passed (no lowercasing, no whitespace collapse)", () => {
    const transcript = "  Oil Leak\n on the Belly  ";
    const result = extractIssues(transcript);
    expect(result[0].raw_transcript).toBe(transcript);
  });
});

describe("internal vocabulary tables", () => {
  it("ISSUE_NAME_BY_SLUG covers every slug in ISSUE_KEYWORDS", () => {
    const slugs = new Set(Object.values(__testing__.ISSUE_KEYWORDS));
    for (const slug of slugs) {
      expect(__testing__.ISSUE_NAME_BY_SLUG[slug]).toBeDefined();
    }
  });

  it("ISSUE_KEYWORDS values match the spec slug set (39 entries)", () => {
    const slugs = new Set(Object.values(__testing__.ISSUE_KEYWORDS));
    // 35 after M4 Item 2. Item D adds four NEW critical types:
    // obstruction (blocked/obstructed), instrument_fault (glitch/frozen/
    // inaccurate/intermittent/not responding), comm_fault (no transmit/
    // no receive/radio static), equipment_out (out) → 35 + 4 = 39.
    expect(slugs.size).toBe(39);
  });

  it("every LOCATION_KEYWORDS value is a registered LOCATION_LABEL (sync invariant)", () => {
    // M4 Item 1: the scanner and the picker must not drift. Every value
    // the extractor can emit must be a real label.
    const labelSet = new Set<string>(LOCATION_LABELS);
    for (const value of Object.values(__testing__.LOCATION_KEYWORDS)) {
      expect(labelSet.has(value)).toBe(true);
    }
  });

  it("retains the coarse fallback zones (no previously-working zone returns null)", () => {
    const values = new Set(Object.values(__testing__.LOCATION_KEYWORDS));
    for (const coarse of [
      "Cockpit",
      "Engine Area",
      "Fuselage",
      "Landing Gear",
      "Left Wing",
      "Right Wing",
      "Tail",
    ]) {
      expect(values.has(coarse)).toBe(true);
    }
  });

  it("picker-only cockpit instruments are NOT in the voice scanner", () => {
    // These exist in LOCATION_LABELS (manual pick) but must never be
    // keyword-scanned — short/ambiguous panel words flood false positives.
    const values = new Set(Object.values(__testing__.LOCATION_KEYWORDS));
    for (const pickerOnly of [
      "Mixture Control",
      "Throttle Control",
      "Turn Coordinator",
      "Glove Box",
    ]) {
      expect(new Set<string>(LOCATION_LABELS).has(pickerOnly)).toBe(true);
      expect(values.has(pickerOnly)).toBe(false);
    }
  });
});

describe("extractIssues — known V1 limitation: negation NOT handled (documents the gap)", () => {
  it("'no oil leak today' currently matches oil_leak (V1.1 will fix)", () => {
    const result = extractIssues("no oil leak today");
    expect(result).toHaveLength(1);
    expect(result[0].type_slug).toBe("oil_leak");
    // This test exists to make the V1 limitation visible — change
    // assertion to .toEqual([]) when negation handling lands.
  });
});

/**
 * Real-world Whisper transcripts. Synthetic keyword-perfect strings
 * give false confidence — actual iPhone Safari voice input includes
 * filler words ("the", "a", "so there is") that the M2 Phase 2
 * compound-slug map could not tolerate. These cases anchor the M5 #2
 * corrective patch: each transcript is a plausible pilot utterance.
 *
 * The first two are the actual production failures from sessions
 * 66b16c86-... and a44dad1a-... that triggered this patch.
 */
describe("extractIssues — real-world Whisper transcripts (production cases)", () => {
  it("production transcript #1: oil + belly + corrosion + left wing", () => {
    const transcript = "Oil on the belly and corrosion on the left wing root.";
    const result = extractIssues(transcript);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      type_slug: "oil_leak",
      location: "Fuselage",
      summary: "Oil Leak observed on Fuselage",
    });
    expect(result[1]).toMatchObject({
      type_slug: "corrosion",
      location: "Left Wing",
      summary: "Corrosion observed on Left Wing",
    });
  });

  it("production transcript #2: same content with filler prefix", () => {
    const transcript =
      "So there is oil on the belly and corrosion on the left wing root.";
    const result = extractIssues(transcript);

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.type_slug)).toEqual(["oil_leak", "corrosion"]);
    expect(result.map((r) => r.location)).toEqual(["Fuselage", "Left Wing"]);
  });

  it("oil leak phrase + belly with filler 'under the'", () => {
    const result = extractIssues("There's an oil leak under the belly today");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type_slug: "oil_leak",
      location: "Fuselage",
    });
  });

  it("corrosion + 'near the' filler before location", () => {
    const result = extractIssues("I see corrosion near the left wing");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type_slug: "corrosion",
      location: "Left Wing",
    });
  });

  it("tire worn + precise gear location (M4 Item 1: 'right main' → Right Main Gear)", () => {
    const result = extractIssues("Tire worn on the right main");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type_slug: "tire_worn",
      location: "Right Main Gear",
    });
  });

  it("bare 'oil' + 'cowling' → Engine Cowl (M4 Item 1: precise cowl)", () => {
    const result = extractIssues("Some oil on the cowling today");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type_slug: "oil_leak",
      location: "Engine Cowl",
    });
  });
});

/**
 * Word-boundary guard for short keywords (length <= 3). Without this,
 * bare "oil" matches inside "spoiler" (s-p-O-I-L-e-r) and "boiling"
 * (b-O-I-L-ing), producing phantom oil_leak rows.
 */
describe("extractIssues — word-boundary matching for short keywords", () => {
  it("does not match 'oil' inside 'spoilers'", () => {
    const result = extractIssues("lowered the spoilers on landing");
    expect(result).toEqual([]);
  });

  it("does not match 'oil' inside 'boiling'", () => {
    const result = extractIssues("boiling water everywhere");
    expect(result).toEqual([]);
  });

  it("still matches 'oil' as a whole word at sentence start", () => {
    const result = extractIssues("Oil on the belly");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type_slug: "oil_leak",
      location: "Fuselage",
    });
  });
});

/**
 * Unpaired short-keyword drop. Bare "oil" with no location keyword
 * within PAIR_WINDOW_CHARS is too ambiguous to emit ("oil pressure
 * looks normal" is not a defect). Multi-word phrases like "oil leak"
 * remain explicit and still emit when unpaired.
 */
describe("extractIssues — drop unpaired short-keyword issues", () => {
  it("'Oil pressure looks normal.' → zero issues (no nearby location)", () => {
    expect(extractIssues("Oil pressure looks normal.")).toEqual([]);
  });

  it("'Oil temp is fine.' → zero issues (no nearby location)", () => {
    expect(extractIssues("Oil temp is fine.")).toEqual([]);
  });

  it("'There's an oil leak.' → 1 issue oil_leak / Location Unknown (phrase still emits unpaired)", () => {
    const result = extractIssues("There's an oil leak.");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type_slug: "oil_leak",
      // item B: emitted unpaired issues read "Location Unknown" (was null).
      location: "Location Unknown",
    });
  });
});

describe("issue taxonomy — severity_class (M3)", () => {
  it("SEVERITY_MAP covers every slug the API can return (41 issue_types rows)", () => {
    // 37 after Item 2; Item D adds obstruction, instrument_fault,
    // comm_fault, equipment_out → 41.
    expect(Object.keys(SEVERITY_MAP)).toHaveLength(41);
  });

  it("every map entry is critical or cosmetic", () => {
    for (const slug of Object.keys(SEVERITY_MAP)) {
      expect(["critical", "cosmetic"]).toContain(SEVERITY_MAP[slug]);
    }
  });

  it("spot-check canonical taxonomy + legacy quick-tag slugs", () => {
    expect(getSeverityForSlug("oil_leak")).toBe("critical");
    expect(getSeverityForSlug("crack")).toBe("critical");
    expect(getSeverityForSlug("corrosion")).toBe("critical");
    expect(getSeverityForSlug("flat_tire")).toBe("critical");
    expect(getSeverityForSlug("low_voltage")).toBe("critical");
    expect(getSeverityForSlug("stiff_control")).toBe("critical");
    expect(getSeverityForSlug("vibration")).toBe("critical");
    expect(getSeverityForSlug("rough_engine")).toBe("critical");

    expect(getSeverityForSlug("dent")).toBe("cosmetic");
    expect(getSeverityForSlug("scratch")).toBe("cosmetic");
    // M4 Item 2 reclassified loose_panel + tire_low cosmetic→critical.
    expect(getSeverityForSlug("loose_panel")).toBe("critical");
    expect(getSeverityForSlug("tire_low")).toBe("critical");

    expect(getSeverityForSlug("oil")).toBe("critical");
    // tire_worn reclassified cosmetic→critical (safety: worn tire can fail on takeoff/landing)
    expect(getSeverityForSlug("tire_worn")).toBe("critical");
    expect(getSeverityForSlug("tire")).toBe("cosmetic");
    // M4 Item 2 — flicker reclassified cosmetic→critical; new types critical.
    expect(getSeverityForSlug("flicker")).toBe("critical");
    expect(getSeverityForSlug("leak_general")).toBe("critical");
    expect(getSeverityForSlug("not_working")).toBe("critical");
    expect(getSeverityForSlug("damage")).toBe("critical");
    expect(getSeverityForSlug("hole")).toBe("critical");
  });

  it("SEVERITY_MAP includes every slug referenced by ISSUE_KEYWORDS", () => {
    const slugs = new Set(Object.values(__testing__.ISSUE_KEYWORDS));
    for (const slug of slugs) {
      expect(SEVERITY_MAP[slug]).toBeDefined();
    }
  });
});
