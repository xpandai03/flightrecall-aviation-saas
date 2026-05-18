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
    });
    expect(p).toContain("Times logged or re-confirmed (logged + still): 1");
  });

  it("embeds structured fields without transcript", () => {
    const p = buildIssueSummaryPrompt({
      issue_type_name: "Corrosion",
      location_label: "Left wing root",
      times_observed: 3,
      last_seen_phrase: "4 flights ago",
    });
    expect(p).toContain("Issue type: Corrosion");
    expect(p).toContain("Location: Left wing root");
    expect(p).toContain("Times logged or re-confirmed (logged + still): 3");
    expect(p).toContain("Last seen: 4 flights ago");
    expect(p).not.toMatch(/transcript/i);
  });

  it("includes every forbidden word in the rules list", () => {
    const p = buildIssueSummaryPrompt({
      issue_type_name: "Vibration",
      location_label: "Left wing",
      times_observed: 1,
      last_seen_phrase: "Current preflight",
    });
    const forbidden = [
      "should",
      "must",
      "consider",
      "danger",
      "safety",
      "immediate",
      "attention",
      "ground",
      "urgent",
      "severe",
      "important",
      "recommend",
      "suggest",
      "advise",
      "critical",
      "cosmetic",
    ];
    for (const word of forbidden) {
      expect(p).toContain(word);
    }
  });

  it("includes BAD and GOOD counter-examples in the prompt body", () => {
    const p = buildIssueSummaryPrompt({
      issue_type_name: "Vibration",
      location_label: "Left wing",
      times_observed: 1,
      last_seen_phrase: "Current preflight",
    });
    expect(p).toContain("BAD:");
    expect(p).toContain("GOOD:");
    // The exact production failing case must remain in the prompt as a
    // negative anchor — if it drifts out, regression risk returns.
    expect(p).toContain("needs immediate attention before flight");
  });

  it("does not echo the severity bucket field", () => {
    const p = buildIssueSummaryPrompt({
      issue_type_name: "Vibration",
      location_label: "Left wing",
      times_observed: 1,
      last_seen_phrase: "Current preflight",
    });
    expect(p).not.toMatch(/Severity bucket:/);
    expect(p).not.toMatch(/severity_class/);
  });

  it("states the no-recommendation rule explicitly", () => {
    const p = buildIssueSummaryPrompt({
      issue_type_name: "Vibration",
      location_label: "Left wing",
      times_observed: 1,
      last_seen_phrase: "Current preflight",
    });
    expect(p).toMatch(/Do not give recommendations/);
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
