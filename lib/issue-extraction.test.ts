import { describe, expect, it } from "vitest";

import { __testing__, extractIssues } from "@/lib/issue-extraction";

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
  it("returns the issue with location null and the (location not specified) summary", () => {
    const transcript = "something feels off";
    const result = extractIssues(transcript);
    expect(result).toEqual([
      {
        type_slug: "something_off",
        location: null,
        summary: "Something Feels Off observed (location not specified)",
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
    expect(locations).toContain("Engine Area");
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
    expect(result[0].location).toBeNull();
  });
});

describe("extractIssues — longest-match-first dominates substring overlap", () => {
  it("'oil on belly' beats 'oil leak' + standalone 'belly' on overlap", () => {
    // Per the V1 spec, 'oil on belly' is itself an issue keyword
    // (slug=oil_on_belly), not 'oil leak' + location 'belly'.
    const result = extractIssues("see some oil on belly here");
    expect(result).toHaveLength(1);
    expect(result[0].type_slug).toBe("oil_on_belly");
    // Location: nearest LOCATION_KEYWORDS match outside the consumed
    // span. The literal "belly" inside "oil on belly" is consumed; no
    // other location keyword exists in the transcript.
    expect(result[0].location).toBeNull();
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

  it("ISSUE_KEYWORDS values match the V1 spec slug set (31 entries)", () => {
    const slugs = new Set(Object.values(__testing__.ISSUE_KEYWORDS));
    // 30 new slugs from the M5 migration + the legacy 'dent' slug,
    // which the V1 STRUCTURAL spec lists as a voice keyword and which
    // already exists in the issue_types seed pre-migration.
    expect(slugs.size).toBe(31);
  });

  it("LOCATION_KEYWORDS canonicalizes to the V1 spec's 6 location groups", () => {
    const labels = new Set(Object.values(__testing__.LOCATION_KEYWORDS));
    expect(labels).toEqual(
      new Set([
        "Left Wing",
        "Right Wing",
        "Fuselage",
        "Engine Area",
        "Tail",
        "Landing Gear",
        "Cockpit",
      ]),
    );
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
