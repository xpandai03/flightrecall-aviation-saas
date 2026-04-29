"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { EntryChoice } from "@/components/preflight/entry-choice";
import { VoiceRecorder } from "@/components/preflight/voice-recorder";
import {
  PhotoCapture,
  PhotoPreview,
} from "@/components/preflight/photo-capture";
import { QuickTagPicker } from "@/components/preflight/quick-tag-picker";
import { Confirmation } from "@/components/preflight/confirmation";
import { CarryForward } from "@/components/preflight/carry-forward";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
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
} from "@/lib/types/database";
import type { RecorderResult } from "@/hooks/use-media-recorder";

type PendingAction = Exclude<IssueAction, "logged">;

// State machine. The "no_issues" flow defers session creation until the
// checklist photo is committed, so a user backing out of the photo step
// leaves nothing in the database (the spec'd "delete on cancel" behavior,
// achieved by never creating in the first place).
type Step =
  | { kind: "idle" }
  | { kind: "recording" }
  | { kind: "capturing" }
  | { kind: "no_issues_capturing" }
  | { kind: "no_issues_preview"; file: File; previewUrl: string }
  | {
      kind: "tagging";
      file: File;
      previewUrl: string;
      quickTag: QuickTag | null;
    }
  | {
      kind: "voice_tagging";
      blob: Blob;
      mimeType: string;
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

export default function PreflightPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const aircraftId = params.id;

  const [aircraft, setAircraft] = React.useState<Aircraft | null>(null);
  const [aircraftLoaded, setAircraftLoaded] = React.useState(false);
  const [step, setStep] = React.useState<Step>({ kind: "idle" });

  React.useEffect(() => {
    let cancelled = false;
    if (!aircraftId) return;
    listAircraft()
      .then((rows) => {
        if (cancelled) return;
        const match = rows.find((r) => r.id === aircraftId) ?? null;
        setAircraft(match);
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
  }, [aircraftId]);

  const defaultAircraft = aircraft;
  const aircraftTail = defaultAircraft?.tail_number ?? "—";
  const {
    issues: activeIssues,
    refresh: refreshActiveIssues,
    optimisticallyRemove: removeActiveIssue,
  } = useActiveIssues(aircraftId);
  const { status: aircraftStatus, refresh: refreshAircraftStatus } =
    useAircraftStatus(aircraftId);

  const revokePreviewUrls = React.useCallback((s: Step) => {
    if (s.kind === "tagging") URL.revokeObjectURL(s.previewUrl);
    if (s.kind === "no_issues_preview") URL.revokeObjectURL(s.previewUrl);
    if (s.kind === "confirming" && s.photo)
      URL.revokeObjectURL(s.photo.previewUrl);
  }, []);

  const reset = React.useCallback(() => {
    setStep((prev) => {
      revokePreviewUrls(prev);
      return { kind: "idle" };
    });
    refreshActiveIssues();
    refreshAircraftStatus();
  }, [refreshActiveIssues, refreshAircraftStatus, revokePreviewUrls]);

  const goToDashboard = React.useCallback(() => {
    setStep((prev) => {
      revokePreviewUrls(prev);
      return prev;
    });
    router.push(`/aircraft/${aircraftId}/dashboard`);
  }, [aircraftId, router, revokePreviewUrls]);

  const handleCarryForwardAction = React.useCallback(
    async (issueId: string, action: PendingAction) => {
      removeActiveIssue(issueId);
      try {
        await postIssueObservation(issueId, { action });
        refreshAircraftStatus();
      } catch (err) {
        toast.error("Couldn't record action", {
          description: err instanceof Error ? err.message : String(err),
        });
        refreshActiveIssues();
      }
    },
    [removeActiveIssue, refreshActiveIssues, refreshAircraftStatus],
  );

  const handlePick = (choice: "voice" | "photo" | "no_issues") => {
    if (!defaultAircraft) {
      toast.error("No aircraft available");
      return;
    }
    if (choice === "voice") setStep({ kind: "recording" });
    else if (choice === "photo") setStep({ kind: "capturing" });
    else setStep({ kind: "no_issues_capturing" });
  };

  const handleVoiceCaptured = (result: RecorderResult) => {
    setStep({
      kind: "voice_tagging",
      blob: result.blob,
      mimeType: result.mimeType,
      quickTag: null,
    });
  };

  const handleVoiceSave = async () => {
    if (step.kind !== "voice_tagging") return;
    if (!defaultAircraft) return;
    const { blob, mimeType, quickTag } = step;
    setStep({ kind: "uploading", mode: "voice" });
    try {
      const session = await createSession({
        aircraft_id: defaultAircraft.id,
        input_type: "voice",
      });
      const { name } = audioFileNameForMime(mimeType);
      const outcome = await uploadMedia({
        preflight_session_id: session.id,
        blob,
        media_type: "audio",
        file_name: name,
        mime_type: mimeType,
        quick_tag: quickTag ?? undefined,
      });
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
      const safeName =
        file.name && file.name.length > 0 ? file.name : "photo.jpg";
      await uploadMedia({
        preflight_session_id: session.id,
        blob: file,
        media_type: "photo",
        file_name: safeName,
        mime_type: file.type || "image/jpeg",
        quick_tag: quickTag ?? undefined,
      });
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

  const handleNoIssuesPhotoCaptured = (file: File, previewUrl: string) => {
    setStep({ kind: "no_issues_preview", file, previewUrl });
  };

  const handleNoIssuesSave = async () => {
    if (step.kind !== "no_issues_preview") return;
    if (!defaultAircraft) return;
    const { file, previewUrl } = step;
    setStep({ kind: "uploading", mode: "no_issues" });
    try {
      const session = await createSession({
        aircraft_id: defaultAircraft.id,
        input_type: "no_issues",
        status_color: "green",
      });
      const safeName =
        file.name && file.name.length > 0 ? file.name : "checklist.jpg";
      await uploadMedia({
        preflight_session_id: session.id,
        blob: file,
        media_type: "photo",
        file_name: safeName,
        mime_type: file.type || "image/jpeg",
      });
      toast.success("Saved", {
        description: "Checklist photo logged.",
      });
      setStep({
        kind: "confirming",
        session,
        mode: "no_issues",
        photo: { previewUrl, quickTag: null },
      });
    } catch (err) {
      toast.error("Couldn't save preflight", {
        description: err instanceof Error ? err.message : String(err),
      });
      URL.revokeObjectURL(previewUrl);
      setStep({ kind: "idle" });
    }
  };

  const sessionForPoll =
    step.kind === "confirming" && step.mode === "voice" ? step.session.id : null;
  const poll = useTranscriptionPoll(sessionForPoll, sessionForPoll !== null);

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
        <VoiceRecorder onComplete={handleVoiceCaptured} onCancel={reset} />
      )}

      {step.kind === "voice_tagging" && (
        <QuickTagPicker
          mode="voice"
          value={step.quickTag}
          onChange={(next) =>
            setStep((prev) =>
              prev.kind === "voice_tagging" ? { ...prev, quickTag: next } : prev,
            )
          }
          onSave={handleVoiceSave}
          onCancel={reset}
        />
      )}

      {step.kind === "capturing" && (
        <PhotoCapture onCaptured={handlePhotoCaptured} onCancel={reset} />
      )}

      {step.kind === "no_issues_capturing" && (
        <div className="flex flex-col items-center gap-4 w-full">
          <div className="text-center max-w-sm">
            <h2 className="text-base font-semibold tracking-tight">
              Snap your checklist
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              A photo of your completed preflight checklist confirms this clean log.
            </p>
          </div>
          <PhotoCapture
            onCaptured={handleNoIssuesPhotoCaptured}
            onCancel={reset}
          />
        </div>
      )}

      {step.kind === "no_issues_preview" && (
        <div className="flex flex-col items-center gap-6 w-full">
          <PhotoPreview
            previewUrl={step.previewUrl}
            onRetake={() => {
              URL.revokeObjectURL(step.previewUrl);
              setStep({ kind: "no_issues_capturing" });
            }}
          />
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={reset} className="rounded-full">
              Cancel
            </Button>
            <Button onClick={handleNoIssuesSave} className="rounded-full">
              Save preflight
            </Button>
          </div>
        </div>
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
                prev.kind === "tagging" ? { ...prev, quickTag: next } : prev,
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
          onDone={goToDashboard}
        />
      )}
    </div>
  );
}
