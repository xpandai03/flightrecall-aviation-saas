"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const PREFERRED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg",
];

function pickSupportedMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const m of PREFERRED_MIME_TYPES) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
      // ignore
    }
  }
  return undefined;
}

export type RecorderState = "idle" | "recording" | "stopping";

export type RecorderResult = {
  blob: Blob;
  mimeType: string;
  durationMs: number;
};

export function useMediaRecorder(opts?: { maxDurationMs?: number }) {
  const maxDurationMs = opts?.maxDurationMs ?? 60_000;

  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<Error | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolveRef = useRef<((r: RecorderResult) => void) | null>(null);
  const rejectRef = useRef<((e: Error) => void) | null>(null);

  const cleanup = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop();
      streamRef.current = null;
    }
    recorderRef.current = null;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const start = useCallback(async (): Promise<RecorderResult> => {
    setError(null);
    setElapsedMs(0);
    chunksRef.current = [];

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e;
    }

    const mime = pickSupportedMime();
    let recorder: MediaRecorder;
    try {
      recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
    } catch (err) {
      for (const t of stream.getTracks()) t.stop();
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e;
    }

    streamRef.current = stream;
    recorderRef.current = recorder;
    startedAtRef.current = Date.now();

    return new Promise<RecorderResult>((resolve, reject) => {
      resolveRef.current = resolve;
      rejectRef.current = reject;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      recorder.onerror = (ev) => {
        const e =
          (ev as unknown as { error?: Error }).error ??
          new Error("MediaRecorder error");
        setError(e);
        cleanup();
        setState("idle");
        rejectRef.current?.(e);
      };
      recorder.onstop = () => {
        const durationMs = Date.now() - startedAtRef.current;
        const finalMime = recorder.mimeType || mime || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: finalMime });
        cleanup();
        setState("idle");
        resolveRef.current?.({ blob, mimeType: finalMime, durationMs });
      };

      try {
        recorder.start();
        setState("recording");
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        cleanup();
        setState("idle");
        rejectRef.current?.(e);
        return;
      }

      tickRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current);
      }, 100);

      autoStopRef.current = setTimeout(() => {
        if (recorderRef.current && recorderRef.current.state !== "inactive") {
          setState("stopping");
          recorderRef.current.stop();
        }
      }, maxDurationMs);
    });
  }, [cleanup, maxDurationMs]);

  const stop = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      setState("stopping");
      recorderRef.current.stop();
    }
  }, []);

  const cancel = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try {
        recorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    cleanup();
    setState("idle");
    setElapsedMs(0);
    rejectRef.current?.(new Error("cancelled"));
  }, [cleanup]);

  return {
    state,
    error,
    elapsedMs,
    maxDurationMs,
    start,
    stop,
    cancel,
  };
}
