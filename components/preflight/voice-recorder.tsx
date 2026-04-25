"use client";

import * as React from "react";
import { Mic, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Orb } from "@/components/orb";
import { useMediaRecorder, type RecorderResult } from "@/hooks/use-media-recorder";

const MAX_DURATION_MS = 60_000;
const COUNTDOWN_THRESHOLD_MS = 10_000;

export function VoiceRecorder({
  onComplete,
  onCancel,
}: {
  onComplete: (result: RecorderResult) => void;
  onCancel: () => void;
}) {
  const recorder = useMediaRecorder({ maxDurationMs: MAX_DURATION_MS });
  const [hasStarted, setHasStarted] = React.useState(false);
  const [permissionError, setPermissionError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (hasStarted) return;
    setHasStarted(true);
    recorder
      .start()
      .then((result) => onComplete(result))
      .catch((err) => {
        if (err instanceof Error && err.message === "cancelled") return;
        setPermissionError(
          err instanceof Error ? err.message : String(err),
        );
      });
    // start() is stable; we intentionally only run once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          Microphone unavailable: {permissionError}
        </div>
        <Button variant="outline" onClick={onCancel} className="rounded-full">
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
            ? `Recording — auto-stop at 60s`
            : recorder.state === "stopping"
              ? "Saving…"
              : "Initializing…"}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="lg"
          onClick={() => {
            recorder.cancel();
            onCancel();
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
