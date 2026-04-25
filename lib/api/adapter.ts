import type {
  Aircraft,
  PreflightSession,
  PreflightSessionWithMedia,
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
  };
}
