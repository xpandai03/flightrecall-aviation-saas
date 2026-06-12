import { describe, expect, it } from "vitest";

import { splitIntoClauses } from "@/lib/issue-extraction";

/**
 * Item B — the deterministic clause segmenter. Hard delimiters ( , ; . ! ? )
 * and word-bounded conjunctions ( " and " / " then " ), trimmed, empties
 * dropped. (Inputs here are already normalized: lowercased, single-spaced.)
 */
describe("splitIntoClauses", () => {
  it("splits on commas", () => {
    expect(
      splitIntoClauses(
        "right main tire looks worn, small dent on passenger side door, fuel smell near left wing root",
      ),
    ).toEqual([
      "right main tire looks worn",
      "small dent on passenger side door",
      "fuel smell near left wing root",
    ]);
  });

  it("splits on 'and' / 'then' (word-bounded)", () => {
    expect(
      splitIntoClauses("dent on the left wing and corrosion on the right wing"),
    ).toEqual(["dent on the left wing", "corrosion on the right wing"]);
    expect(splitIntoClauses("oil on the belly then crack in the tail")).toEqual([
      "oil on the belly",
      "crack in the tail",
    ]);
  });

  it("does NOT split inside words containing 'and' (errand, android)", () => {
    expect(splitIntoClauses("errand near the android panel")).toEqual([
      "errand near the android panel",
    ]);
  });

  it("splits on periods / semicolons / ! / ?", () => {
    expect(splitIntoClauses("oil on the belly. crack in the tail")).toEqual([
      "oil on the belly",
      "crack in the tail",
    ]);
    expect(splitIntoClauses("oil on the belly; crack in the tail")).toEqual([
      "oil on the belly",
      "crack in the tail",
    ]);
  });

  it("returns a single clause for a run-on with no delimiters (OD2)", () => {
    expect(
      splitIntoClauses("right main tire looks worn small dent on the door"),
    ).toEqual(["right main tire looks worn small dent on the door"]);
  });

  it("trims segments and drops empties (trailing punctuation, double delimiters)", () => {
    expect(splitIntoClauses("oil on the belly,, crack in the tail.")).toEqual([
      "oil on the belly",
      "crack in the tail",
    ]);
    expect(splitIntoClauses("")).toEqual([]);
    expect(splitIntoClauses("   ")).toEqual([]);
    expect(splitIntoClauses(",.;")).toEqual([]);
  });
});
