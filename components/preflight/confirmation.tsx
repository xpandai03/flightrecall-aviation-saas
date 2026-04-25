"use client";

import { CheckCircle2, Loader2, Plane, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { InputType, QuickTag, StatusColor } from "@/lib/types/database";
import type { PollResult } from "@/hooks/use-transcription-poll";

export type ConfirmationProps = {
  inputType: InputType;
  aircraftTail: string;
  createdAtIso: string;
  statusColor: StatusColor | null;
  // voice-only
  poll?: PollResult;
  // photo-only
  photo?: { previewUrl: string; quickTag: QuickTag | null };
  onDone: () => void;
};

function formatStamp(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${date} · ${time}`;
}

function StatusPill({ status, inputType }: { status: StatusColor | null; inputType: InputType }) {
  const label =
    inputType === "no_issues"
      ? "All clear"
      : inputType === "voice"
        ? "Voice note"
        : "Photo logged";
  const className =
    status === "green"
      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
      : status === "yellow"
        ? "bg-amber-50 text-amber-700 border border-amber-200"
        : status === "red"
          ? "bg-rose-50 text-rose-700 border border-rose-200"
          : "bg-sky-50 text-sky-700 border border-sky-200";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}
    >
      {label}
    </span>
  );
}

export function Confirmation({
  inputType,
  aircraftTail,
  createdAtIso,
  statusColor,
  poll,
  photo,
  onDone,
}: ConfirmationProps) {
  const stillTranscribing =
    inputType === "voice" &&
    poll &&
    (poll.phase === "polling" || poll.status === "pending" || poll.status === "processing");

  return (
    <div className="w-full max-w-md flex flex-col items-center gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <span
          className={`flex size-12 items-center justify-center rounded-full ${
            stillTranscribing
              ? "bg-sky-50 text-sky-600"
              : "bg-emerald-50 text-emerald-600"
          }`}
        >
          {stillTranscribing ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <CheckCircle2 className="size-5" />
          )}
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">Preflight Logged</h1>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Plane className="size-3 -rotate-45" />
          {aircraftTail} · {formatStamp(createdAtIso)}
        </div>
        <div className="mt-1">
          <StatusPill status={statusColor} inputType={inputType} />
        </div>
      </div>

      <div className="w-full rounded-2xl border border-border/80 bg-card px-5 py-4 min-h-[7.5rem]">
        {inputType === "no_issues" && (
          <p className="text-sm text-foreground">All systems nominal.</p>
        )}

        {inputType === "voice" && poll && (
          <VoicePanel poll={poll} />
        )}

        {inputType === "photo" && photo && (
          <PhotoPanel previewUrl={photo.previewUrl} quickTag={photo.quickTag} />
        )}
      </div>

      <Button
        size="lg"
        onClick={onDone}
        className="rounded-full px-8 h-11"
      >
        {stillTranscribing ? "Done · transcript will arrive shortly" : "Done"}
      </Button>
    </div>
  );
}

function VoicePanel({ poll }: { poll: PollResult }) {
  if (poll.phase === "completed" && poll.transcript_text) {
    return (
      <div className="space-y-1.5">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Transcript
        </div>
        <p className="text-[15px] leading-relaxed text-foreground whitespace-pre-line">
          {poll.transcript_text}
        </p>
      </div>
    );
  }

  if (poll.phase === "failed" || poll.phase === "timed_out") {
    return (
      <div className="flex items-start gap-2 text-sm text-amber-900">
        <AlertTriangle className="size-4 mt-0.5 shrink-0 text-amber-500" />
        <div>
          <div className="font-medium">Transcription unavailable</div>
          <div className="text-xs text-amber-800/80 mt-0.5">
            {poll.phase === "timed_out"
              ? "Taking longer than expected — your session is saved; the transcript may still arrive on a later view."
              : "Whisper couldn't process this clip. Your session is saved either way."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin text-sky-500" />
      Transcribing… (attempt {poll.attempts + 1})
    </div>
  );
}

function PhotoPanel({
  previewUrl,
  quickTag,
}: {
  previewUrl: string;
  quickTag: QuickTag | null;
}) {
  return (
    <div className="flex items-center gap-4">
      <div className="size-20 rounded-lg overflow-hidden bg-muted ring-1 ring-border/60 shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewUrl}
          alt="Captured photo"
          className="w-full h-full object-cover"
        />
      </div>
      <div className="flex-1">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
          Photo
        </div>
        {quickTag ? (
          <Badge
            variant="secondary"
            className="bg-sky-50 text-sky-700 border border-sky-200 capitalize"
          >
            {quickTag}
          </Badge>
        ) : (
          <span className="text-sm text-muted-foreground">No tag</span>
        )}
      </div>
    </div>
  );
}
