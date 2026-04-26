"use client";

import { useEffect, useRef, useState } from "react";
import { getSession } from "@/lib/api/sessions";
import type {
  PreflightSessionDetail,
  TranscriptionStatus,
} from "@/lib/types/database";

export type PollPhase = "idle" | "polling" | "completed" | "failed" | "timed_out";

export type PollResult = {
  phase: PollPhase;
  status: TranscriptionStatus | null;
  transcript_text: string | null;
  attempts: number;
  error: string | null;
};

const DEFAULT_INTERVAL_MS = 2500;
const DEFAULT_MAX_ATTEMPTS = 24;

export function useTranscriptionPoll(
  sessionId: string | null,
  enabled: boolean,
  opts?: { intervalMs?: number; maxAttempts?: number },
): PollResult {
  const intervalMs = opts?.intervalMs ?? DEFAULT_INTERVAL_MS;
  const maxAttempts = opts?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  const [result, setResult] = useState<PollResult>({
    phase: "idle",
    status: null,
    transcript_text: null,
    attempts: 0,
    error: null,
  });

  const cancelRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled || !sessionId) return;

    let attempts = 0;
    let stopped = false;

    setResult({
      phase: "polling",
      status: null,
      transcript_text: null,
      attempts: 0,
      error: null,
    });

    const tick = async () => {
      if (stopped) return;
      attempts += 1;
      cancelRef.current = new AbortController();
      try {
        const session: PreflightSessionDetail = await getSession(sessionId);
        const tx = (session.voice_transcriptions ?? [])[0];
        const status: TranscriptionStatus | null = tx?.transcription_status ?? null;
        const text = session.transcript_text ?? tx?.transcript_text ?? null;

        if (status === "completed") {
          setResult({
            phase: "completed",
            status,
            transcript_text: text,
            attempts,
            error: null,
          });
          return;
        }
        if (status === "failed") {
          setResult({
            phase: "failed",
            status,
            transcript_text: null,
            attempts,
            error: tx?.error_message ?? null,
          });
          return;
        }

        if (attempts >= maxAttempts) {
          setResult({
            phase: "timed_out",
            status,
            transcript_text: text,
            attempts,
            error: null,
          });
          return;
        }

        setResult({
          phase: "polling",
          status,
          transcript_text: text,
          attempts,
          error: null,
        });
        timerRef.current = setTimeout(tick, intervalMs);
      } catch (err) {
        if (stopped) return;
        if (attempts >= maxAttempts) {
          setResult((prev) => ({
            ...prev,
            phase: "timed_out",
            attempts,
            error: err instanceof Error ? err.message : String(err),
          }));
          return;
        }
        timerRef.current = setTimeout(tick, intervalMs);
      }
    };

    timerRef.current = setTimeout(tick, intervalMs);

    return () => {
      stopped = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      cancelRef.current?.abort();
    };
  }, [enabled, sessionId, intervalMs, maxAttempts]);

  return result;
}
