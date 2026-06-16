import type { StatusColor } from "@/lib/types/database";

/**
 * A1 — session PDF export. PURE assembly (no I/O, no server-only) so it is
 * unit-testable: turns a fetched session (metadata + issues + observations +
 * transcripts + photos) into the structured model the PDF renderer draws.
 * The route fetches photo BYTES separately (Phase-4 gated signed URLs).
 */

export type ExportIssue = {
  type: string;
  location: string;
  severity: string;
  status: string;
};

export type ExportPhotoRef = {
  storage_key: string;
  mime_type: string | null;
};

export type SessionExportModel = {
  tail: string;
  dateLabel: string;
  statusLabel: string;
  issues: ExportIssue[];
  notes: string[];
  photos: ExportPhotoRef[];
  generatedAtLabel: string;
};

/** Cap embedded photos so a huge session can't time out / bloat the PDF.
 *  Overflow is reported in the PDF ("N more photos not shown"). */
export const EXPORT_PHOTO_CAP = 12;

type ObsRow = {
  issue?: {
    id?: string | null;
    location?: string | null;
    current_status?: string | null;
    issue_type?: { name?: string | null; severity_class?: string | null } | null;
  } | null;
};
type TxRow = {
  transcription_status?: string | null;
  transcript_text?: string | null;
};
type MediaRow = {
  media_type?: string | null;
  storage_key?: string | null;
  mime_type?: string | null;
};

export type SessionExportInput = {
  tail: string;
  created_at: string;
  status_color: StatusColor | null;
  notes_text: string | null;
  issue_observations?: ObsRow[] | null;
  voice_transcriptions?: TxRow[] | null;
  media_assets?: MediaRow[] | null;
};

function statusColorLabel(c: StatusColor | null): string {
  if (c === "green") return "All clear";
  if (c === "yellow") return "Monitor";
  if (c === "red") return "Needs attention";
  return "Logged";
}

function severityLabel(sev: string | null | undefined): string {
  if (sev === "critical") return "Critical";
  if (sev === "cosmetic") return "Monitor";
  return "—";
}

/** Deterministic UTC stamp (locale/TZ-independent for stable tests + filenames). */
export function formatExportStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)} UTC`;
}

export function exportFilename(tail: string, iso: string): string {
  const safeTail = (tail || "aircraft").replace(/[^a-zA-Z0-9_-]/g, "") || "aircraft";
  const day = Number.isNaN(new Date(iso).getTime())
    ? "session"
    : new Date(iso).toISOString().slice(0, 10);
  return `preflight-${safeTail}-${day}.pdf`;
}

function splitLines(s: string | null | undefined): string[] {
  if (!s) return [];
  return s
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

export function buildSessionExportModel(
  input: SessionExportInput,
  nowIso: string,
): SessionExportModel {
  // Issues: one row per distinct issue (dedupe by issue id), from the
  // session's observations.
  const seen = new Set<string>();
  const issues: ExportIssue[] = [];
  for (const obs of input.issue_observations ?? []) {
    const issue = obs.issue;
    if (!issue) continue;
    const key = issue.id ?? `${issue.issue_type?.name}|${issue.location}`;
    if (seen.has(key)) continue;
    seen.add(key);
    issues.push({
      type: issue.issue_type?.name?.trim() || "Issue",
      location: issue.location?.trim() || "Location not specified",
      severity: severityLabel(issue.issue_type?.severity_class),
      status: issue.current_status === "resolved" ? "Resolved" : "Active",
    });
  }

  // Notes: typed notes + COMPLETED voice transcripts (don't block on
  // in-flight transcription — export what exists).
  const notes: string[] = [
    ...splitLines(input.notes_text),
    ...(input.voice_transcriptions ?? [])
      .filter((t) => t.transcription_status === "completed")
      .flatMap((t) => splitLines(t.transcript_text)),
  ];

  // Photos: session-linked photos only (checklist images are aircraft-level,
  // not in this session's media join).
  const photos: ExportPhotoRef[] = (input.media_assets ?? [])
    .filter((m) => m.media_type === "photo" && Boolean(m.storage_key))
    .map((m) => ({
      storage_key: m.storage_key as string,
      mime_type: m.mime_type ?? null,
    }));

  return {
    tail: input.tail,
    dateLabel: formatExportStamp(input.created_at),
    statusLabel: statusColorLabel(input.status_color),
    issues,
    notes,
    photos,
    generatedAtLabel: formatExportStamp(nowIso),
  };
}

/** pdf-lib can embed JPEG + PNG from bytes; HEIC/other are skipped with a
 *  note in the PDF (iOS sometimes yields HEIC). */
export function isEmbeddablePhoto(mime: string | null): "jpg" | "png" | null {
  const m = (mime ?? "").toLowerCase();
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("png")) return "png";
  return null;
}
