import { describe, expect, it } from "vitest";

import {
  applyTranscriptionCorrections,
  AVIATION_TRANSCRIPTION_CORRECTIONS,
} from "@/lib/transcription-corrections";

describe("applyTranscriptionCorrections — known aviation mis-hearings", () => {
  it("corrects 'pilot tube' → 'pitot tube'", () => {
    expect(applyTranscriptionCorrections("pilot tube looks blocked")).toBe(
      "pitot tube looks blocked",
    );
  });

  it("corrects 'pedo tube' → 'pitot tube'", () => {
    expect(applyTranscriptionCorrections("pedo tube looks blocked")).toBe(
      "pitot tube looks blocked",
    );
  });

  it("leaves already-correct 'pitot tube' unchanged", () => {
    expect(applyTranscriptionCorrections("pitot tube looks blocked")).toBe(
      "pitot tube looks blocked",
    );
  });

  it("is case-insensitive but only the phrase is touched", () => {
    expect(applyTranscriptionCorrections("Pilot Tube is blocked")).toBe(
      "pitot tube is blocked",
    );
  });

  it("matches across multiple spaces (Whisper spacing)", () => {
    expect(applyTranscriptionCorrections("pilot   tube blocked")).toBe(
      "pitot tube blocked",
    );
  });

  it("is idempotent — applying twice yields the same string", () => {
    const once = applyTranscriptionCorrections("pilot tube blocked");
    expect(applyTranscriptionCorrections(once)).toBe(once);
  });

  it("does not stack: no correction's output is another's input", () => {
    // Every target is "pitot tube", which is not itself a key.
    for (const target of Object.values(AVIATION_TRANSCRIPTION_CORRECTIONS)) {
      expect(AVIATION_TRANSCRIPTION_CORRECTIONS[target]).toBeUndefined();
    }
  });

  it("handles empty / whitespace input", () => {
    expect(applyTranscriptionCorrections("")).toBe("");
    expect(applyTranscriptionCorrections("   ")).toBe("   ");
  });
});

describe("applyTranscriptionCorrections — ADVERSARIAL: benign speech untouched", () => {
  // Standalone "pilot" is a person and must NEVER be rewritten.
  const benign = [
    "the pilot taxied to the runway",
    "autopilot disengaged on downwind",
    "pilot error caused the go-around",
    "the pilot reported a smell",
    "co-pilot side door",
    "copilot tube", // word-boundary: 'pilot' is inside 'copilot' → no match
    "the pilot's checklist",
  ];

  it.each(benign)("does not rewrite: %s", (text) => {
    expect(applyTranscriptionCorrections(text)).toBe(text);
  });

  it("does not touch text around a real correction", () => {
    expect(
      applyTranscriptionCorrections(
        "before the pilot tube and after the pilot left",
      ),
    ).toBe("before the pitot tube and after the pilot left");
  });
});
