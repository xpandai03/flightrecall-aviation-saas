import { describe, expect, it } from "vitest";

import {
  buildSessionExportModel,
  exportFilename,
  formatExportStamp,
  isEmbeddablePhoto,
  type SessionExportInput,
} from "@/lib/session-export";

const NOW = "2026-06-15T09:00:00.000Z";

function input(over: Partial<SessionExportInput> = {}): SessionExportInput {
  return {
    tail: "N12345",
    created_at: "2026-06-15T14:30:00.000Z",
    status_color: "yellow",
    notes_text: null,
    issue_observations: [],
    voice_transcriptions: [],
    media_assets: [],
    ...over,
  };
}

describe("buildSessionExportModel — A1 session PDF data assembly", () => {
  it("assembles metadata (tail, date, status, generated-on)", () => {
    const m = buildSessionExportModel(input(), NOW);
    expect(m.tail).toBe("N12345");
    expect(m.dateLabel).toBe("2026-06-15 14:30 UTC");
    expect(m.statusLabel).toBe("Monitor");
    expect(m.generatedAtLabel).toBe("2026-06-15 09:00 UTC");
  });

  it("includes issues (type, location, severity, status), deduped by issue id", () => {
    const m = buildSessionExportModel(
      input({
        issue_observations: [
          {
            issue: {
              id: "iss-1",
              location: "Right Tire",
              current_status: "active",
              issue_type: { name: "Tire Worn", severity_class: "critical" },
            },
          },
          {
            // same issue, second observation → deduped
            issue: {
              id: "iss-1",
              location: "Right Tire",
              current_status: "active",
              issue_type: { name: "Tire Worn", severity_class: "critical" },
            },
          },
          {
            issue: {
              id: "iss-2",
              location: null,
              current_status: "resolved",
              issue_type: { name: "Dent", severity_class: "cosmetic" },
            },
          },
        ],
      }),
      NOW,
    );
    expect(m.issues).toEqual([
      { type: "Tire Worn", location: "Right Tire", severity: "Critical", status: "Active" },
      { type: "Dent", location: "Location not specified", severity: "Monitor", status: "Resolved" },
    ]);
  });

  it("includes notes + COMPLETED transcripts; ignores in-flight transcription", () => {
    const m = buildSessionExportModel(
      input({
        notes_text: "checked the wing\nlooks ok",
        voice_transcriptions: [
          { transcription_status: "completed", transcript_text: "oil on the belly" },
          { transcription_status: "processing", transcript_text: null },
        ],
      }),
      NOW,
    );
    expect(m.notes).toEqual(["checked the wing", "looks ok", "oil on the belly"]);
  });

  it("collects session photos only", () => {
    const m = buildSessionExportModel(
      input({
        media_assets: [
          { media_type: "photo", storage_key: "k1", mime_type: "image/jpeg" },
          { media_type: "audio", storage_key: "k2", mime_type: "audio/webm" },
          { media_type: "photo", storage_key: "k3", mime_type: "image/png" },
        ],
      }),
      NOW,
    );
    expect(m.photos).toEqual([
      { storage_key: "k1", mime_type: "image/jpeg" },
      { storage_key: "k3", mime_type: "image/png" },
    ]);
  });

  it("no-issue + no-photo session still assembles (PDF will still generate)", () => {
    const m = buildSessionExportModel(
      input({ status_color: "green", notes_text: "all good" }),
      NOW,
    );
    expect(m.issues).toEqual([]);
    expect(m.photos).toEqual([]);
    expect(m.notes).toEqual(["all good"]);
    expect(m.statusLabel).toBe("All clear");
  });
});

describe("export helpers", () => {
  it("filename is preflight-<tail>-<date>.pdf (sanitized)", () => {
    expect(exportFilename("N12345", "2026-06-15T14:30:00Z")).toBe(
      "preflight-N12345-2026-06-15.pdf",
    );
    expect(exportFilename("N 12/345", "2026-06-15T14:30:00Z")).toBe(
      "preflight-N12345-2026-06-15.pdf",
    );
  });

  it("formatExportStamp is deterministic UTC", () => {
    expect(formatExportStamp("2026-06-15T14:30:00.000Z")).toBe("2026-06-15 14:30 UTC");
  });

  it("isEmbeddablePhoto: jpg/png embeddable, HEIC/other not", () => {
    expect(isEmbeddablePhoto("image/jpeg")).toBe("jpg");
    expect(isEmbeddablePhoto("image/png")).toBe("png");
    expect(isEmbeddablePhoto("image/heic")).toBeNull();
    expect(isEmbeddablePhoto(null)).toBeNull();
  });
});
