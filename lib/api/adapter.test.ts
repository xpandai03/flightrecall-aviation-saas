import { describe, expect, it } from "vitest";

import { summarizeSession, type SummarizableSession } from "@/lib/api/adapter";

/**
 * M4 Item 4 — fixed-issue persistence surfacing fix.
 *
 * summarizeSession's Tier 1 (tracked-issue observations) must only surface
 * observations whose parent issue is still ACTIVE. A resolved (fixed /
 * cleared) issue must stop reading as a current problem in the recent-
 * sessions summary; the session still summarizes (via the lower tiers)
 * and is never dropped.
 */

// Minimal observation factory — only the fields summarizeSession reads.
function obs(name: string, status: "active" | "resolved") {
  return {
    id: `obs-${name}-${status}`,
    issue_id: `iss-${name}`,
    preflight_session_id: "ses-1",
    action: "logged" as const,
    raw_transcript: null,
    summary: null,
    created_at: "2026-06-02T00:00:00.000Z",
    issue: {
      id: `iss-${name}`,
      current_status: status,
      issue_type: { name },
    },
  } as unknown as NonNullable<SummarizableSession["issue_observations"]>[number];
}

function session(
  over: Partial<SummarizableSession> = {},
): SummarizableSession {
  return {
    input_type: "voice",
    status_color: "yellow",
    transcript_text: null,
    notes_text: null,
    media_assets: [],
    voice_transcriptions: [],
    issue_observations: [],
    ...over,
  };
}

describe("summarizeSession — resolved issues do not read as current (M4 Item 4)", () => {
  it("an ACTIVE tracked issue still surfaces as the summary", () => {
    const s = session({ issue_observations: [obs("Oil Leak", "active")] });
    expect(summarizeSession(s)).toBe("Oil Leak");
  });

  it("a RESOLVED issue does not surface; falls through to transcript tier", () => {
    const s = session({
      issue_observations: [obs("Oil Leak", "resolved")],
      transcript_text: "walkaround complete, nothing new",
    });
    expect(summarizeSession(s)).toBe("walkaround complete, nothing new");
  });

  it("a session whose ONLY issue is resolved still summarizes (never blank, never dropped)", () => {
    // No transcript/notes/quick_tag → status-based fallback still applies.
    const s = session({
      issue_observations: [obs("Dent", "resolved")],
      status_color: "green",
    });
    expect(summarizeSession(s)).toBe("No issues reported");

    const s2 = session({
      issue_observations: [obs("Dent", "resolved")],
      status_color: "yellow",
    });
    expect(summarizeSession(s2)).toBe("Logged");
  });

  it("mixed active + resolved → only the active issue name shows", () => {
    const s = session({
      issue_observations: [
        obs("Oil Leak", "resolved"),
        obs("Corrosion", "active"),
      ],
    });
    expect(summarizeSession(s)).toBe("Corrosion");
  });

  it("a null/missing joined issue is treated as not-active (falls through)", () => {
    const broken = {
      ...obs("Ghost", "active"),
      issue: null,
    } as unknown as NonNullable<
      SummarizableSession["issue_observations"]
    >[number];
    const s = session({
      issue_observations: [broken],
      notes_text: "manual note",
    });
    expect(summarizeSession(s)).toBe("manual note");
  });
});
