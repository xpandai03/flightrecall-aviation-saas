import { describe, expect, it } from "vitest";

import { UNKNOWN_PILOT, displayPilotName, loggedByLabel } from "@/lib/pilot-name";

describe("pilot-name — attribution display (first name only, neutral fallback)", () => {
  it("shows the first name when present", () => {
    expect(displayPilotName("Raunek")).toBe("Raunek");
    expect(displayPilotName("  Zach  ")).toBe("Zach");
  });

  it("falls back to a neutral label when absent — never an email", () => {
    expect(displayPilotName(null)).toBe(UNKNOWN_PILOT);
    expect(displayPilotName(undefined)).toBe(UNKNOWN_PILOT);
    expect(displayPilotName("")).toBe(UNKNOWN_PILOT);
    expect(displayPilotName("   ")).toBe(UNKNOWN_PILOT);
  });

  it("builds the 'logged by' label with name or fallback", () => {
    expect(loggedByLabel("Raunek")).toBe("Logged by Raunek");
    expect(loggedByLabel(null)).toBe(`Logged by ${UNKNOWN_PILOT}`);
    expect(loggedByLabel("Zach", "Marked fixed by")).toBe("Marked fixed by Zach");
  });
});
