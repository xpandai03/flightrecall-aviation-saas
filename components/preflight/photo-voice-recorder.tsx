"use client";

import * as React from "react";
import { Mic, Square, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Orb } from "@/components/orb";
import {
  useMediaRecorder,
  type RecorderResult,
} from "@/hooks/use-media-recorder";

const MAX_DURATION_MS = 30_000;
const COUNTDOWN_THRESHOLD_MS = 10_000;

/**
 * Photo-attached voice: manual start, 30s cap, no auto-start (unlike standalone
 * {@link VoiceRecorder}).
 */
export function PhotoVoiceRecorder({
  onComplete,
  onCancelBack,
}: {
  onComplete: (result: RecorderResult) => void;
  onCancelBack: () => void;
}) {
  const recorder = useMediaRecorder({ maxDurationMs: MAX_DURATION_MS });
  const [started, setStarted] = React.useState(false);
  const [permissionError, setPermissionError] = React.useState<string | null>(
    null,
  );

  const handleStart = () => {
    setStarted(true);
    recorder
      .start()
      .then((r) => onComplete(r))
      .catch((err) => {
        if (err instanceof Error && err.message === "cancelled") return;
        setPermissionError(
          err instanceof Error ? err.message : String(err),
        );
      });
  };

  const remainingMs = Math.max(0, MAX_DURATION_MS - recorder.elapsedMs);
  const inCountdown = remainingMs <= COUNTDOWN_THRESHOLD_MS;
  const remainingSec = Math.ceil(remainingMs / 1000);
  const elapsedSec = Math.floor(recorder.elapsedMs / 1000);
  const elapsedDisplay = `${String(Math.floor(elapsedSec / 60)).padStart(1, "0")}:${String(
    elapsedSec % 60,
  ).padStart(2, "0")}`;

  if (permissionError) {
    return (
      <div className="flex flex-col items-center gap-4 max-w-md text-center">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Couldn&apos;t record audio. Try again or go back.
        </div>
        <p className="text-xs text-muted-foreground">{permissionError}</p>
        <Button variant="outline" onClick={onCancelBack} className="rounded-full">
          Back
        </Button>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-md">
        <div className="text-center">
          <h3 className="text-base font-semibold tracking-tight">Voice note</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs">
            Short context for this photo only — tap Start when ready.
          </p>
        </div>
        <Button size="lg" onClick={handleStart} className="rounded-full h-12 px-8">
          <Mic className="size-4 mr-2" />
          Start
        </Button>
        <Button variant="outline" onClick={onCancelBack} className="rounded-full">
          <X className="size-3.5" />
          Back
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 w-full">
      <Orb state="listening" audioLevel={0.4} />

      <div className="flex flex-col items-center gap-1">
        <div
          className={`text-3xl font-mono font-semibold tabular-nums ${
            inCountdown ? "text-amber-600" : "text-foreground"
          }`}
          aria-live="polite"
        >
          {inCountdown && recorder.state === "recording"
            ? `${remainingSec}…`
            : elapsedDisplay}
        </div>
        <div className="text-xs text-muted-foreground">
          {recorder.state === "recording"
            ? "Recording — auto-stop at 30s"
            : recorder.state === "stopping"
              ? "Saving…"
              : "Starting…"}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="lg"
          onClick={() => {
            recorder.cancel();
            onCancelBack();
          }}
          className="rounded-full"
          disabled={recorder.state === "stopping"}
        >
          <X className="size-3.5" />
          Cancel
        </Button>
        <Button
          size="lg"
          onClick={recorder.stop}
          className="h-12 px-7 rounded-full"
          disabled={recorder.state !== "recording"}
        >
          {recorder.state === "stopping" ? (
            <Mic className="size-4 animate-pulse" />
          ) : (
            <Square className="size-3.5 fill-current" />
          )}
          Stop
        </Button>
      </div>
    </div>
  );
}
