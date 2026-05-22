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
    expected: { type: "tire_worn", location: "Landing Gear" },
    note: "Case 1 — worn-tire phrasing with a filler word; M3 release fix",
  },
  {
    input: "small dent on passenger side door",
    expected: { type: "dent", location: null },
    note: "Case 2 — already correct pre-fix; locked as a regression anchor",
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
    expected: { type: "tire_worn", location: "Landing Gear" },
    note: "contiguous 'tire worn' phrase still wins (longest-match-first)",
  },
  {
    input: "Some oil on the cowling today",
    expected: { type: "oil_leak", location: "Engine Area" },
  },
  {
    input: "there's a vibration in the tail",
    expected: { type: "vibration", location: "Tail" },
  },
  {
    input: "flat tire on the nose gear",
    expected: { type: "flat_tire", location: "Landing Gear" },
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
    expected: { type: "scratch", location: "Engine Area" },
    note: "multi-word alias — 'rock chips' maps to 'scratch'",
  },
  {
    input: "the right main tire is low pressure",
    expected: { type: "tire_low", location: "Landing Gear" },
    note: "multi-word alias — 'low pressure' maps to 'tire_low'",
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
