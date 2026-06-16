import { describe, expect, it } from "vitest";

import {
  aircraftMatchesJoin,
  isJoinByTailWellFormed,
  normalizeTailForJoin,
  normalizeTypeForJoin,
} from "@/lib/open-join";

describe("open-join — tail/type normalization (mirrors the SQL)", () => {
  it("normalizeTailForJoin uppercases and strips all whitespace", () => {
    expect(normalizeTailForJoin(" n12 345 ")).toBe("N12345");
    expect(normalizeTailForJoin("n-123ab")).toBe("N-123AB");
    expect(normalizeTailForJoin("")).toBe("");
    expect(normalizeTailForJoin("   ")).toBe("");
  });

  it("normalizeTypeForJoin trims and lowercases", () => {
    expect(normalizeTypeForJoin("  Cessna 172 ")).toBe("cessna 172");
    expect(normalizeTypeForJoin("PIPER")).toBe("piper");
    expect(normalizeTypeForJoin("   ")).toBe("");
  });

  it("isJoinByTailWellFormed requires BOTH a tail and a type", () => {
    expect(isJoinByTailWellFormed("N12345", "Cessna 172")).toBe(true);
    expect(isJoinByTailWellFormed("N12345", "")).toBe(false);
    expect(isJoinByTailWellFormed("N12345", "   ")).toBe(false);
    expect(isJoinByTailWellFormed("", "Cessna 172")).toBe(false);
    expect(isJoinByTailWellFormed("   ", "Cessna 172")).toBe(false);
  });
});

describe("open-join — match predicate (the contract the DB enforces)", () => {
  const cessna = { tail_number: "N12345", aircraft_type: "Cessna 172" };

  it("matches on exact tail + type", () => {
    expect(aircraftMatchesJoin(cessna, "N12345", "Cessna 172")).toBe(true);
  });

  it("matches case-insensitively / with surrounding whitespace + tail spaces", () => {
    expect(aircraftMatchesJoin(cessna, " n12 345 ", "  cessna 172 ")).toBe(
      true,
    );
  });

  it("WRONG TYPE → no match (the small barrier)", () => {
    expect(aircraftMatchesJoin(cessna, "N12345", "Piper")).toBe(false);
  });

  it("WRONG TAIL → no match", () => {
    expect(aircraftMatchesJoin(cessna, "N99999", "Cessna 172")).toBe(false);
  });

  it("missing type submission → no match (both fields required)", () => {
    expect(aircraftMatchesJoin(cessna, "N12345", "")).toBe(false);
  });

  it("aircraft with NULL type can never be open-joined (fail-closed)", () => {
    const noType = { tail_number: "N12345", aircraft_type: null };
    expect(aircraftMatchesJoin(noType, "N12345", "Cessna 172")).toBe(false);
    expect(aircraftMatchesJoin(noType, "N12345", "")).toBe(false);
  });

  it("ISOLATION CONTRACT: a submission matching aircraft X never matches a different aircraft Y", () => {
    // Joining is gated by this match; the SECURITY DEFINER function inserts a
    // membership row for the MATCHED aircraft only. So submitting X's tail+type
    // can only ever produce X-membership — Y stays unmatched (and, via Phase-1
    // membership RLS, invisible). This asserts the matching half of that.
    const aircraftX = { tail_number: "N12345", aircraft_type: "Cessna 172" };
    const aircraftY = { tail_number: "N99999", aircraft_type: "Piper Cherokee" };

    expect(aircraftMatchesJoin(aircraftX, "N12345", "Cessna 172")).toBe(true);
    // The SAME submission must NOT match Y on tail, type, or both.
    expect(aircraftMatchesJoin(aircraftY, "N12345", "Cessna 172")).toBe(false);
  });
});
