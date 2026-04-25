"use client";

import * as React from "react";
import type {
  Aircraft,
  InputType,
  PreflightSession,
  PreflightSessionWithMedia,
  StatusColor,
} from "@/lib/types/database";
import type { Session } from "@/lib/mock-helpers";
import { adaptSession } from "@/lib/api/adapter";

export type CreateSessionInput = {
  aircraft_id: string;
  input_type: InputType;
  notes_text?: string;
  transcript_text?: string;
  status_color?: StatusColor;
};

export type UploadUrlInput = {
  preflight_session_id: string;
  media_type: "photo" | "audio";
  file_name: string;
  mime_type: string;
};

export type UploadUrlResponse = {
  media_asset_id: string;
  signed_url: string;
  storage_key: string;
  token: string;
};

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: "no-store", ...init });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`${init?.method ?? "GET"} ${url} → ${r.status}: ${text}`);
  }
  return r.json() as Promise<T>;
}

export function listAircraft(): Promise<Aircraft[]> {
  return jsonFetch<Aircraft[]>("/api/v1/aircraft");
}

export function listSessions(opts: { aircraftId?: string; limit?: number } = {}): Promise<PreflightSessionWithMedia[]> {
  const params = new URLSearchParams();
  if (opts.aircraftId) params.set("aircraftId", opts.aircraftId);
  if (opts.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  return jsonFetch<PreflightSessionWithMedia[]>(
    `/api/v1/preflight-sessions${qs ? `?${qs}` : ""}`,
  );
}

export function getSession(id: string): Promise<PreflightSessionWithMedia> {
  return jsonFetch<PreflightSessionWithMedia>(`/api/v1/preflight-sessions/${id}`);
}

export function createSession(body: CreateSessionInput): Promise<PreflightSession> {
  return jsonFetch<PreflightSession>("/api/v1/preflight-sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function requestUploadUrl(body: UploadUrlInput): Promise<UploadUrlResponse> {
  return jsonFetch<UploadUrlResponse>("/api/v1/media/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// =====================================================================
// Hook — replaces the old useSessions() that came from SessionsProvider.
// Same shape: { sessions, addSession }, plus loading/error/aircraft for
// callers that need them. Optimistic prepend + one re-fetch on add.
// =====================================================================

type AddSessionInput = {
  input_type: InputType;
  notes_text?: string;
  transcript_text?: string;
  status_color?: StatusColor;
  // optional view-model extras for the optimistic placeholder only
  optimisticPhotos?: string[];
  optimisticNotes?: { text: string; timestamp?: string }[];
  optimisticRepeatedFlags?: string[];
};

export type UseSessionsResult = {
  sessions: Session[];
  loading: boolean;
  error: Error | null;
  aircraft: Aircraft[];
  defaultAircraft: Aircraft | null;
  addSession: (input: AddSessionInput) => Promise<PreflightSession>;
  refresh: () => Promise<void>;
};

function todayLabel(): string {
  return new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function nowTime(): string {
  return new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function useSessions(): UseSessionsResult {
  const [aircraft, setAircraft] = React.useState<Aircraft[]>([]);
  const [rows, setRows] = React.useState<PreflightSessionWithMedia[]>([]);
  const [optimistic, setOptimistic] = React.useState<Session[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [acft, ses] = await Promise.all([listAircraft(), listSessions()]);
      setAircraft(acft);
      setRows(ses);
      setOptimistic([]);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const sessions = React.useMemo<Session[]>(() => {
    const adapted = rows.map((r) => adaptSession(r, aircraft, rows));
    // Optimistic entries are prepended; on refresh, they're cleared and the
    // real DB rows take their place.
    return [...optimistic, ...adapted];
  }, [aircraft, rows, optimistic]);

  const defaultAircraft = aircraft[0] ?? null;

  const addSession = React.useCallback(
    async (input: AddSessionInput): Promise<PreflightSession> => {
      if (!defaultAircraft) {
        throw new Error("No aircraft available to attach session to");
      }
      const tempId = `temp-${Date.now()}`;
      const placeholder: Session = {
        id: tempId,
        aircraft: defaultAircraft.tail_number,
        date: todayLabel(),
        notes:
          input.optimisticNotes ??
          (input.transcript_text ?? input.notes_text ?? "")
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean)
            .map((text) => ({ text, timestamp: nowTime() })),
        photos: input.optimisticPhotos ?? [],
        repeatedFlags: input.optimisticRepeatedFlags ?? [],
      };
      setOptimistic((prev) => [placeholder, ...prev]);
      try {
        const created = await createSession({
          aircraft_id: defaultAircraft.id,
          input_type: input.input_type,
          notes_text: input.notes_text,
          transcript_text: input.transcript_text,
          status_color: input.status_color,
        });
        await refresh();
        return created;
      } catch (e) {
        setOptimistic((prev) => prev.filter((s) => s.id !== tempId));
        setError(e as Error);
        throw e;
      }
    },
    [defaultAircraft, refresh],
  );

  return {
    sessions,
    loading,
    error,
    aircraft,
    defaultAircraft,
    addSession,
    refresh,
  };
}
