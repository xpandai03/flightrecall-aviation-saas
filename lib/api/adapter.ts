import type {
  Aircraft,
  IssueObservationDetail,
  PreflightSession,
  PreflightSessionWithMedia,
  QuickTag,
} from "@/lib/types/database";
import {
  type Observation,
  type Session,
  normalize,
} from "@/lib/mock-helpers";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function parseObservations(
  notes_text: string | null,
  transcript_text: string | null,
  fallbackTimestamp?: string,
): Observation[] {
  const source = transcript_text ?? notes_text;
  if (!source || !source.trim()) return [];
  const ts = fallbackTimestamp ? formatTime(fallbackTimestamp) : undefined;
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text) => ({ text, timestamp: ts }));
}

function collectKeys(
  row: Pick<PreflightSession, "notes_text" | "transcript_text">,
): string[] {
  const seen = new Set<string>();
  const blobs = [row.notes_text, row.transcript_text].filter(
    (x): x is string => Boolean(x),
  );
  for (const blob of blobs) {
    for (const line of blob.split(/\r?\n/)) {
      const k = normalize(line);
      if (k) seen.add(k);
    }
  }
  return Array.from(seen);
}

function computeRepeatedFlags(
  row: PreflightSession,
  allRows: PreflightSession[],
): string[] {
  const myKeys = collectKeys(row);
  if (myKeys.length === 0) return [];
  const flags: string[] = [];
  for (const key of myKeys) {
    const otherHits = allRows.some(
      (r) => r.id !== row.id && collectKeys(r).includes(key),
    );
    if (otherHits) flags.push(key);
  }
  return flags;
}

export function adaptSession(
  row: PreflightSessionWithMedia,
  aircraft: Aircraft[],
  allRows: PreflightSession[],
): Session {
  const tail =
    aircraft.find((a) => a.id === row.aircraft_id)?.tail_number ?? "—";
  const photos = (row.media_assets ?? [])
    .filter((m) => m.media_type === "photo")
    .map((m) => m.storage_key);
  const notes = parseObservations(
    row.notes_text,
    row.transcript_text,
    row.created_at,
  );

  // M2: surface transcription state in the card copy when there's no
  // notes/transcript yet. (Failed → "Transcription unavailable",
  // pending/processing → "Transcribing…".)
  if (notes.length === 0 && row.input_type === "voice") {
    const tx = (row.voice_transcriptions ?? [])[0];
    if (tx) {
      const ts = formatTime(row.created_at);
      if (tx.transcription_status === "failed") {
        notes.push({ text: "Transcription unavailable", timestamp: ts });
      } else if (
        tx.transcription_status === "pending" ||
        tx.transcription_status === "processing"
      ) {
        notes.push({ text: "Transcribing…", timestamp: ts });
      }
    }
  }

  if (notes.length === 0 && row.input_type === "no_issues") {
    notes.push({ text: "No issues reported", timestamp: formatTime(row.created_at) });
  }
  return {
    id: row.id,
    aircraft: tail,
    date: formatDate(row.created_at),
    notes,
    photos,
    repeatedFlags: computeRepeatedFlags(row, allRows),
    statusColor: row.status_color,
  };
}

// ---------------------------------------------------------------------------
// summarizeSession — five-tier fallback used by the redesigned Dashboard's
// recent-sessions list. Independent of adaptSession; never returns the
// generic "Voice note" / "Photo" labels the old dashboard used.
// ---------------------------------------------------------------------------

const QUICK_TAG_LABEL: Record<QuickTag, string> = {
  scratch: "Scratch",
  dent: "Dent",
  tire: "Tire wear",
  oil: "Oil residue",
  other: "Other",
};

const SUMMARY_MAX_CHARS = 60;

/** Truncate to ~60 chars, append U+2026 ellipsis (not three dots). */
function truncate(s: string): string {
  const trimmed = s.trim();
  if (trimmed.length <= SUMMARY_MAX_CHARS) return trimmed;
  return trimmed.slice(0, SUMMARY_MAX_CHARS - 1).trimEnd() + "…";
}

function firstNonEmptyLine(s: string | null | undefined): string | null {
  if (!s) return null;
  for (const line of s.split(/\r?\n/)) {
    const t = line.trim();
    if (t) return t;
  }
  return null;
}

// Lenient input shape: the dashboard's direct Supabase query may not select
// every PreflightSessionWithMedia field. We only read what we use.
export type SummarizableSession = Pick<
  PreflightSession,
  "input_type" | "status_color" | "transcript_text" | "notes_text"
> & {
  media_assets?: Array<{ media_type: "photo" | "audio"; quick_tag: QuickTag | null }>;
  voice_transcriptions?: Array<{ transcript_text: string | null }>;
  issue_observations?: IssueObservationDetail[];
};

/**
 * Five-tier fallback chain:
 *   1. Joined issue_observations[].issue.issue_type.name (one or two, comma-joined)
 *   2. transcript_text first non-empty line (or voice_transcriptions[0].transcript_text)
 *   3. notes_text first non-empty line
 *   4. media_assets[].quick_tag mapped via QUICK_TAG_LABEL (never raw slug)
 *   5. status_color === 'green' → "No issues reported"; else "Logged"
 *
 * Output is hard-capped at 60 chars + ellipsis.
 */
export function summarizeSession(session: SummarizableSession): string {
  // Tier 1: tracked-issue observations.
  const observations = session.issue_observations ?? [];
  if (observations.length > 0) {
    const names = Array.from(
      new Set(
        observations
          .map((o) => o.issue?.issue_type?.name)
          .filter((n): n is string => Boolean(n)),
      ),
    ).slice(0, 2);
    // TODO: append a per-action suffix (still / fixed) once UX confirms phrasing.
    if (names.length > 0) return truncate(names.join(", "));
  }

  // Tier 2: transcript (column or joined transcription row).
  const transcriptLine =
    firstNonEmptyLine(session.transcript_text) ??
    firstNonEmptyLine(session.voice_transcriptions?.[0]?.transcript_text);
  if (transcriptLine) return truncate(transcriptLine);

  // Tier 3: typed notes.
  const notesLine = firstNonEmptyLine(session.notes_text);
  if (notesLine) return truncate(notesLine);

  // Tier 4: quick tag from any tagged media asset.
  const taggedMedia = (session.media_assets ?? []).find((m) => m.quick_tag);
  if (taggedMedia?.quick_tag) {
    return QUICK_TAG_LABEL[taggedMedia.quick_tag];
  }

  // Tier 5: status-based fallback.
  if (session.status_color === "green") return "No issues reported";
  return "Logged";
}
