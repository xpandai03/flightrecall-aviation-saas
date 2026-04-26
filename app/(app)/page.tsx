"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2, Plane } from "lucide-react";

import { EntryChoice } from "@/components/preflight/entry-choice";
import { VoiceRecorder } from "@/components/preflight/voice-recorder";
import {
  PhotoCapture,
  PhotoPreview,
} from "@/components/preflight/photo-capture";
import { QuickTagPicker } from "@/components/preflight/quick-tag-picker";
import { Confirmation } from "@/components/preflight/confirmation";
import { CarryForward } from "@/components/preflight/carry-forward";
import { createSession, listAircraft } from "@/lib/api/sessions";
import { uploadMedia, audioFileNameForMime } from "@/lib/api/media";
import {
  postIssueObservation,
  useActiveIssues,
  useAircraftStatus,
} from "@/lib/api/issues";
import { useTranscriptionPoll } from "@/hooks/use-transcription-poll";
import type {
  Aircraft,
  InputType,
  IssueAction,
  PreflightSession,
  QuickTag,
  StatusColor,
} from "@/lib/types/database";
import type { RecorderResult } from "@/hooks/use-media-recorder";

type PendingAction = Exclude<IssueAction, "logged">;

type Step =
  | { kind: "idle" }
  | { kind: "recording" }
  | { kind: "capturing" }
  | {
      kind: "tagging";
      file: File;
      previewUrl: string;
      quickTag: QuickTag | null;
    }
  | { kind: "uploading"; mode: InputType }
  | {
      kind: "confirming";
      session: PreflightSession;
      mode: InputType;
      voiceTranscriptionId?: string;
      photo?: { previewUrl: string; quickTag: QuickTag | null };
    };

function todayLabel(): string {
  return new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function DashboardPage() {
  const [aircraft, setAircraft] = React.useState<Aircraft[]>([]);
  const [aircraftLoaded, setAircraftLoaded] = React.useState(false);
  const [step, setStep] = React.useState<Step>({ kind: "idle" });
  const [pendingActions, setPendingActions] = React.useState<
    Map<string, PendingAction>
  >(new Map());

  React.useEffect(() => {
    let cancelled = false;
    listAircraft()
      .then((rows) => {
        if (cancelled) return;
        setAircraft(rows);
        setAircraftLoaded(true);
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error("Failed to load aircraft", {
          description: err instanceof Error ? err.message : String(err),
        });
        setAircraftLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const defaultAircraft = aircraft[0] ?? null;
  const aircraftTail = defaultAircraft?.tail_number ?? "—";

  const aircraftId = defaultAircraft?.id ?? null;
  const { issues: activeIssues, refresh: refreshActiveIssues } =
    useActiveIssues(aircraftId);
  const { status: aircraftStatus, refresh: refreshAircraftStatus } =
    useAircraftStatus(aircraftId);

  const reset = React.useCallback(() => {
    setStep((prev) => {
      if (prev.kind === "tagging") URL.revokeObjectURL(prev.previewUrl);
      if (prev.kind === "confirming" && prev.photo) {
        URL.revokeObjectURL(prev.photo.previewUrl);
      }
      return { kind: "idle" };
    });
    setPendingActions(new Map());
    refreshActiveIssues();
    refreshAircraftStatus();
  }, [refreshActiveIssues, refreshAircraftStatus]);

  const handleCarryForwardAction = React.useCallback(
    (issueId: string, action: PendingAction) => {
      setPendingActions((prev) => {
        const next = new Map(prev);
        if (next.get(issueId) === action) {
          next.delete(issueId);
        } else {
          next.set(issueId, action);
        }
        return next;
      });
    },
    [],
  );

  const flushPendingActions = React.useCallback(
    async (sessionId: string) => {
      if (pendingActions.size === 0) return;
      const entries = Array.from(pendingActions.entries());
      const results = await Promise.allSettled(
        entries.map(([issueId, action]) =>
          postIssueObservation(issueId, {
            action,
            preflight_session_id: sessionId,
          }),
        ),
      );
      const failures = results.filter((r) => r.status === "rejected");
      if (failures.length > 0) {
        toast.error(
          `${failures.length} issue ${failures.length === 1 ? "action" : "actions"} failed to record`,
        );
      }
      setPendingActions(new Map());
    },
    [pendingActions],
  );

  const handlePick = (choice: "voice" | "photo" | "no_issues") => {
    if (!defaultAircraft) {
      toast.error("No aircraft available");
      return;
    }
    if (choice === "voice") setStep({ kind: "recording" });
    else if (choice === "photo") setStep({ kind: "capturing" });
    else void handleNoIssues();
  };

  const handleNoIssues = async () => {
    if (!defaultAircraft) return;
    setStep({ kind: "uploading", mode: "no_issues" });
    try {
      const session = await createSession({
        aircraft_id: defaultAircraft.id,
        input_type: "no_issues",
        status_color: "green",
      });
      await flushPendingActions(session.id);
      setStep({ kind: "confirming", session, mode: "no_issues" });
    } catch (err) {
      toast.error("Couldn't save session", {
        description: err instanceof Error ? err.message : String(err),
      });
      setStep({ kind: "idle" });
    }
  };

  const handleVoiceComplete = async (result: RecorderResult) => {
    if (!defaultAircraft) return;
    setStep({ kind: "uploading", mode: "voice" });
    try {
      const session = await createSession({
        aircraft_id: defaultAircraft.id,
        input_type: "voice",
      });
      const { name } = audioFileNameForMime(result.mimeType);
      const outcome = await uploadMedia({
        preflight_session_id: session.id,
        blob: result.blob,
        media_type: "audio",
        file_name: name,
        mime_type: result.mimeType,
      });
      await flushPendingActions(session.id);
      toast.success("Saved", {
        description: "Recording captured. Transcribing…",
      });
      setStep({
        kind: "confirming",
        session,
        mode: "voice",
        voiceTranscriptionId: outcome.voice_transcription_id,
      });
    } catch (err) {
      toast.error("Couldn't save voice note", {
        description: err instanceof Error ? err.message : String(err),
      });
      setStep({ kind: "idle" });
    }
  };

  const handlePhotoCaptured = (file: File, previewUrl: string) => {
    setStep({ kind: "tagging", file, previewUrl, quickTag: null });
  };

  const handlePhotoSave = async () => {
    if (step.kind !== "tagging") return;
    if (!defaultAircraft) return;
    const { file, previewUrl, quickTag } = step;
    setStep({ kind: "uploading", mode: "photo" });
    try {
      const session = await createSession({
        aircraft_id: defaultAircraft.id,
        input_type: "photo",
      });
      const safeName = file.name && file.name.length > 0 ? file.name : "photo.jpg";
      await uploadMedia({
        preflight_session_id: session.id,
        blob: file,
        media_type: "photo",
        file_name: safeName,
        mime_type: file.type || "image/jpeg",
        quick_tag: quickTag ?? undefined,
      });
      await flushPendingActions(session.id);
      toast.success("Saved", { description: "Photo logged to this session." });
      setStep({
        kind: "confirming",
        session,
        mode: "photo",
        photo: { previewUrl, quickTag },
      });
    } catch (err) {
      toast.error("Couldn't save photo", {
        description: err instanceof Error ? err.message : String(err),
      });
      URL.revokeObjectURL(previewUrl);
      setStep({ kind: "idle" });
    }
  };

  const sessionForPoll =
    step.kind === "confirming" && step.mode === "voice" ? step.session.id : null;
  const poll = useTranscriptionPoll(
    sessionForPoll,
    sessionForPoll !== null,
  );

  return (
    <div className="flex flex-col items-center gap-10 py-4 sm:py-10">
      <div className="flex flex-col items-center text-center gap-2">
        <StatusChip
          color={aircraftStatus?.status_color ?? null}
          label={`Preflight · ${todayLabel()} · ${aircraftTail}`}
        />
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
          Flight Recall
        </h1>
        <p className="text-muted-foreground text-sm sm:text-base">
          Voice-first preflight logging. Speak what you see, we remember.
        </p>
      </div>

      {step.kind === "idle" && activeIssues.length > 0 && (
        <CarryForward
          issues={activeIssues}
          pendingActions={pendingActions}
          onAction={handleCarryForwardAction}
          disabled={false}
          totalActiveCount={aircraftStatus?.active_issue_count}
        />
      )}

      {step.kind === "idle" &&
        (aircraftLoaded && defaultAircraft ? (
          <EntryChoice onPick={handlePick} />
        ) : (
          <p className="text-sm text-muted-foreground">Loading aircraft…</p>
        ))}

      {step.kind === "recording" && (
        <VoiceRecorder
          onComplete={handleVoiceComplete}
          onCancel={reset}
        />
      )}

      {step.kind === "capturing" && (
        <PhotoCapture
          onCaptured={handlePhotoCaptured}
          onCancel={reset}
        />
      )}

      {step.kind === "tagging" && (
        <div className="flex flex-col items-center gap-6 w-full">
          <PhotoPreview
            previewUrl={step.previewUrl}
            onRetake={() => {
              URL.revokeObjectURL(step.previewUrl);
              setStep({ kind: "capturing" });
            }}
          />
          <QuickTagPicker
            value={step.quickTag}
            onChange={(next) =>
              setStep((prev) =>
                prev.kind === "tagging"
                  ? { ...prev, quickTag: next }
                  : prev,
              )
            }
            onSave={handlePhotoSave}
            onCancel={reset}
          />
        </div>
      )}

      {step.kind === "uploading" && (
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="size-6 animate-spin text-sky-500" />
          <div className="text-sm">Saving…</div>
        </div>
      )}

      {step.kind === "confirming" && (
        <Confirmation
          inputType={step.mode}
          aircraftTail={aircraftTail}
          createdAtIso={step.session.created_at}
          statusColor={step.session.status_color}
          poll={step.mode === "voice" ? poll : undefined}
          photo={step.photo}
          onDone={reset}
        />
      )}
    </div>
  );
}

function StatusChip({
  color,
  label,
}: {
  color: StatusColor | null;
  label: string;
}) {
  const cls =
    color === "green"
      ? "border-emerald-200/70 bg-emerald-50/70 text-emerald-700"
      : color === "yellow"
        ? "border-amber-200/70 bg-amber-50/70 text-amber-700"
        : color === "red"
          ? "border-rose-200/70 bg-rose-50/70 text-rose-700"
          : "border-sky-200/70 bg-sky-50/70 text-sky-700";
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full border ${cls} px-3 py-1 text-xs font-medium`}
    >
      <Plane className="size-3 -rotate-45" />
      {label}
    </div>
  );
}

