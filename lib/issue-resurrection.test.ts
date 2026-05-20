import { describe, expect, it } from "vitest";

import {
  isStillRejectedForResolved,
  selectIssueForExtraction,
  STILL_ON_RESOLVED_ERROR,
} from "@/lib/issue-resurrection";

describe("selectIssueForExtraction", () => {
  it("inserts a new issue when no row matches", () => {
    expect(selectIssueForExtraction([])).toEqual({ action: "insert" });
  });

  it("does not resurrect a resolved match — inserts a fresh row", () => {
    expect(
      selectIssueForExtraction([{ id: "r1", current_status: "resolved" }]),
    ).toEqual({ action: "insert" });
  });

  it("reuses an active match", () => {
    expect(
      selectIssueForExtraction([{ id: "a1", current_status: "active" }]),
    ).toEqual({ action: "update", id: "a1" });
  });

  it("reuses the active row when a resolved and an active row coexist", () => {
    expect(
      selectIssueForExtraction([
        { id: "r1", current_status: "resolved" },
        { id: "a1", current_status: "active" },
      ]),
    ).toEqual({ action: "update", id: "a1" });
  });

  it("inserts when every match is resolved (multiple past occurrences)", () => {
    expect(
      selectIssueForExtraction([
        { id: "r1", current_status: "resolved" },
        { id: "r2", current_status: "resolved" },
      ]),
    ).toEqual({ action: "insert" });
  });
});

describe("isStillRejectedForResolved", () => {
  it("rejects 'still' on a resolved issue", () => {
    expect(isStillRejectedForResolved("still", "resolved")).toBe(true);
  });

  it("allows 'still' on an active issue", () => {
    expect(isStillRejectedForResolved("still", "active")).toBe(false);
  });

  it("allows 'fixed' on a resolved issue (idempotent no-op)", () => {
    expect(isStillRejectedForResolved("fixed", "resolved")).toBe(false);
  });

  it("allows 'skipped' on a resolved issue (idempotent no-op)", () => {
    expect(isStillRejectedForResolved("skipped", "resolved")).toBe(false);
  });

  it("exposes a stable, transcript-free error message", () => {
    expect(STILL_ON_RESOLVED_ERROR).toBe(
      "Cannot mark resolved issue as still present",
    );
  });
});
