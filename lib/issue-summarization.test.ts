import { describe, expect, it } from "vitest";

import {
  buildIssueSummaryPrompt,
  lastSeenPhraseFromFlightsSince,
  validateIssueSummaryOutput,
} from "@/lib/issue-summary-prompt";

describe("lastSeenPhraseFromFlightsSince", () => {
  it("uses current preflight for 0 or 1", () => {
    expect(lastSeenPhraseFromFlightsSince(0)).toBe("Current preflight");
    expect(lastSeenPhraseFromFlightsSince(1)).toBe("Current preflight");
  });

  it("uses flights ago for 2+", () => {
    expect(lastSeenPhraseFromFlightsSince(2)).toBe("2 flights ago");
  });
});

describe("buildIssueSummaryPrompt", () => {
  it("uses Math.max(1, times_observed) for the count line", () => {
    const p = buildIssueSummaryPrompt({
      issue_type_name: "Oil leak",
      location_label: "Belly",
      times_observed: 0,
      last_seen_phrase: "Current preflight",
      severity_class: "critical",
    });
    expect(p).toContain("Times logged or re-confirmed (logged + still): 1");
  });

  it("embeds structured fields without transcript", () => {
    const p = buildIssueSummaryPrompt({
      issue_type_name: "Corrosion",
      location_label: "Left wing root",
      times_observed: 3,
      last_seen_phrase: "4 flights ago",
      severity_class: "cosmetic",
    });
    expect(p).toContain("Issue type: Corrosion");
    expect(p).toContain("Location: Left wing root");
    expect(p).toContain("Times logged or re-confirmed (logged + still): 3");
    expect(p).toContain("Last seen: 4 flights ago");
    expect(p).toContain("Severity bucket: cosmetic");
    expect(p).not.toMatch(/transcript/i);
  });
});

describe("validateIssueSummaryOutput", () => {
  it("accepts two clear sentences", () => {
    expect(
      validateIssueSummaryOutput(
        "Oil pooling at the belly fairing. Last noted on the current preflight and logged once before.",
      ),
    ).toBe(true);
  });

  it("rejects one sentence", () => {
    expect(validateIssueSummaryOutput("Only one sentence here.")).toBe(false);
  });

  it("rejects empty or too short", () => {
    expect(validateIssueSummaryOutput("Short.")).toBe(false);
    expect(validateIssueSummaryOutput("")).toBe(false);
  });
});
