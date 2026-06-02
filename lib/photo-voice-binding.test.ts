import { describe, expect, it } from "vitest";

import { decidePhotoVoiceBinding } from "@/lib/photo-voice-binding";

/**
 * M4 Item 3 — photo+voice = one observation. Behavior matrix for how a
 * photo-attached voice note binds to an issue. (The photo's quick_tag
 * issue is deferred at upload, so these are the only outcomes.)
 */
describe("decidePhotoVoiceBinding — photo+voice one-observation matrix", () => {
  it("voice extracts one issue → bind photo to that issue (no duplicate)", () => {
    expect(
      decidePhotoVoiceBinding({
        firstExtractedIssueId: "iss-1",
        photoQuickTag: null,
        photoExistingIssueId: null,
      }),
    ).toEqual({ action: "bind", issueId: "iss-1" });
  });

  it("voice extracts multiple → bind photo to the FIRST only", () => {
    // The caller passes the first persisted issue id; the binding never
    // links the others. Same outcome shape, the 'first' contract lives in
    // persistExtractedIssues' return value.
    expect(
      decidePhotoVoiceBinding({
        firstExtractedIssueId: "iss-first",
        photoQuickTag: null,
        photoExistingIssueId: null,
      }),
    ).toEqual({ action: "bind", issueId: "iss-first" });
  });

  it("quick_tag AND a voice issue → voice wins, tag NOT used (no duplicate)", () => {
    const result = decidePhotoVoiceBinding({
      firstExtractedIssueId: "iss-voice",
      photoQuickTag: "dent",
      photoExistingIssueId: null,
    });
    expect(result).toEqual({ action: "bind", issueId: "iss-voice" });
    // Crucially NOT a fallback — the tag never creates a second issue.
    expect(result.action).not.toBe("fallback");
  });

  it("voice extracts nothing but a quick_tag exists → tag fallback creates one issue", () => {
    expect(
      decidePhotoVoiceBinding({
        firstExtractedIssueId: null,
        photoQuickTag: "scratch",
        photoExistingIssueId: null,
      }),
    ).toEqual({ action: "fallback", quickTag: "scratch" });
  });

  it("voice extracts nothing and no quick_tag → transcript-only, no issue", () => {
    expect(
      decidePhotoVoiceBinding({
        firstExtractedIssueId: null,
        photoQuickTag: null,
        photoExistingIssueId: null,
      }),
    ).toEqual({ action: "none" });
  });

  it("defensive: photo already linked + no voice issue → do nothing (no double fallback)", () => {
    expect(
      decidePhotoVoiceBinding({
        firstExtractedIssueId: null,
        photoQuickTag: "oil",
        photoExistingIssueId: "iss-existing",
      }),
    ).toEqual({ action: "none" });
  });
});
