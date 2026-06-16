import { describe, expect, it } from "vitest";

import {
  countPhotosByIssue,
  countVoiceObservations,
  linkedMediaLabel,
} from "@/lib/issue-media";
import { formatFirstReported } from "@/lib/issue-derivation";

describe("A4 — linked-media derivation for the quick-view card", () => {
  it("countPhotosByIssue counts photos per issue, ignores audio/null", () => {
    const m = countPhotosByIssue([
      { issue_id: "a", media_type: "photo" },
      { issue_id: "a", media_type: "photo" },
      { issue_id: "a", media_type: "audio" }, // not a photo
      { issue_id: "b", media_type: "photo" },
      { issue_id: null, media_type: "photo" }, // unlinked
    ]);
    expect(m.get("a")).toBe(2);
    expect(m.get("b")).toBe(1);
    expect(m.has("c")).toBe(false);
  });

  it("countVoiceObservations counts observations carrying a transcript", () => {
    expect(
      countVoiceObservations([
        { raw_transcript: "oil on the belly" },
        { raw_transcript: "  " }, // blank → not voice
        { raw_transcript: null }, // photo quick-tag → not voice
        { raw_transcript: "crack on the wing" },
      ]),
    ).toBe(2);
  });

  it("linkedMediaLabel: compact label, null when none (clean card)", () => {
    expect(linkedMediaLabel(1, 1)).toBe("1 photo · 1 voice");
    expect(linkedMediaLabel(2, 0)).toBe("2 photos");
    expect(linkedMediaLabel(0, 3)).toBe("3 voice");
    expect(linkedMediaLabel(0, 0)).toBeNull();
  });

  it("formatFirstReported renders a readable date", () => {
    expect(formatFirstReported("2026-06-03T14:30:00.000Z")).toMatch(
      /Jun 3, 2026/,
    );
    expect(formatFirstReported("not-a-date")).toBe("");
  });
});
