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
import {
  InProgressList,
  type InProgressInput,
} from "@/components/preflight/in-progress-list";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import {
  createSession,
  finalizeSession,
  getInProgressSession,
  listAircraft,
} from "@/lib/api/sessions";
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
  PreflightSessionWithMedia,
  QuickTag,
} from "@/lib/types/database";
import type { RecorderResult } from "@/hooks/use-media-recorder";

type PendingAction = Exclude<IssueAction, "logged">;

// State machine. Per-input flows go through capture → tagging → uploading
// → confirming, and Confirmation's Done button now returns to 'idle' (not
// dashboard). The session is created on the first input's save and reused
// for every subsequent input until the user taps End Preflight.
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
    }
  | { kind: "finalizing" };

function todayLabel(): string {
  return new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

const SUMMARY_MAX_CHARS = 60;

function truncateSummary(s: string): string {
  const trimmed = s.trim();
  if (trimmed.length <= SUMMARY_MAX_CHARS) return trimmed;
  return trimmed.slice(0, SUMMARY_MAX_CHARS - 1).trimEnd() + "…";
}

function quickTagLabel(tag: QuickTag | null | undefined): string | null {
  if (!tag) return null;
  switch (tag) {
    case "scratch": return "Scratch";
    case "dent":    return "Dent";
    case "tire":    return "Tire wear";
    case "oil":     return "Oil residue";
    case "other":   return "Other";
  }
}

/**
 * Adapt a resumed in-progress session's joined media + transcripts into the
 * list shape rendered by <InProgressList>. Sorted oldest-first so the list
 * matches the order the pilot logged them in.
 */
function inputsFromResumedSession(
  session: PreflightSessionWithMedia,
): InProgressInput[] {
  const transcripts = session.voice_transcriptions ?? [];
  const transcriptByMediaId = new Map<string, (typeof transcripts)[number]>();
  for (const t of transcripts) {
    transcriptByMediaId.set(t.media_asset_id, t);
  }

  const items: { sortKey: string; input: InProgressInput }[] = [];
  for (const m of session.media_assets ?? []) {
    if (m.media_type === "audio") {
      const t = transcriptByMediaId.get(m.id);
      const completed = t?.transcription_status === "completed";
      const summary =
        completed && t?.transcript_text
          ? truncateSummary(t.transcript_text)
          : null;
      items.push({
        sortKey: m.created_at,
        input: {
          key: t?.id ?? m.id,
          kind: "voice",
          summary,
          pending:
            !completed &&
            t?.transcription_status !== "failed",
        },
      });
    } else if (m.media_type === "photo") {
      const isChecklist = session.input_type === "no_issues";
      items.push({
        sortKey: m.created_at,
        input: {
          key: m.id,
          kind: isChecklist ? "no_issues" : "photo",
          summary: quickTagLabel(m.quick_tag),
        },
      });
    }
  }
  items.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  return items.map((x) => x.input);
}

export default function PreflightPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const aircraftId = params.id;

  const [aircraft, setAircraft] = React.useState<Aircraft | null>(null);
  const [aircraftLoaded, setAircraftLoaded] = React.useState(false);
  const [step, setStep] = React.useState<Step>({ kind: "idle" });

  // Multi-input session state. inProgressSession is null until the first
  // save creates a row (or until a resume populates it on mount).
  const [inProgressSession, setInProgressSession] =
    React.useState<PreflightSession | null>(null);
  const [inputsLogged, setInputsLogged] = React.useState<InProgressInput[]>([]);

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

  // Mount-time resume: pull the most recent unfinalized session for this
  // aircraft within the resume window and rehydrate the in-progress list.
  React.useEffect(() => {
    if (!aircraftId) return;
    let cancelled = false;
    getInProgressSession(aircraftId)
      .then((res) => {
        if (cancelled) return;
        if (res.session) {
          setInProgressSession(res.session);
          setInputsLogged(inputsFromResumedSession(res.session));
        }
      })
      .catch(() => {
        // Silent — resume is a convenience, not a hard requirement.
      });
    return () => {
      cancelled = true;
    };
  }, [aircraftId]);

  const defaultAircraft = aircraft;
  const aircraftTail = defaultAircraft?.tail_number ?? "—";
  const {
    critical: carryCriticalIssues,
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

  // Cancellation path — discard any in-flight capture and return to idle.
  // Does NOT touch the in-progress session; that lives across cancellations.
  const reset = React.useCallback(() => {
    setStep((prev) => {
      revokePreviewUrls(prev);
      return { kind: "idle" };
    });
    refreshActiveIssues();
    refreshAircraftStatus();
  }, [refreshActiveIssues, refreshAircraftStatus, revokePreviewUrls]);

  /**
   * Use the existing in-progress session if there is one; otherwise create a
   * new session row with the chosen first-input mode. Returns the session.
   */
  const ensureSession = React.useCallback(
    async (firstInputMode: InputType): Promise<PreflightSession> => {
      if (inProgressSession) return inProgressSession;
      if (!defaultAircraft) {
        throw new Error("No aircraft available");
      }
      const created = await createSession({
        aircraft_id: defaultAircraft.id,
        input_type: firstInputMode,
        ...(firstInputMode === "no_issues" ? { status_color: "green" } : {}),
      });
      setInProgressSession(created);
      return created;
    },
    [defaultAircraft, inProgressSession],
  );

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
      const session = await ensureSession("voice");
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
      const session = await ensureSession("photo");
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
      const session = await ensureSession("no_issues");
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

  /**
   * Confirmation Done — append the just-saved input to the in-progress
   * list and return to idle so the user can add another input or finalize.
   */
  const handleConfirmDone = React.useCallback(() => {
    setStep((prev) => {
      revokePreviewUrls(prev);
      if (prev.kind !== "confirming") return { kind: "idle" };

      let entry: InProgressInput;
      if (prev.mode === "voice") {
        const transcript =
          poll?.phase === "completed" ? poll.transcript_text : null;
        entry = {
          key: prev.voiceTranscriptionId ?? `voice-${Date.now()}`,
          kind: "voice",
          summary: transcript ? truncateSummary(transcript) : null,
          pending: !transcript,
        };
      } else if (prev.mode === "photo") {
        entry = {
          key: `photo-${Date.now()}`,
          kind: "photo",
          summary: quickTagLabel(prev.photo?.quickTag ?? null),
        };
      } else {
        entry = {
          key: `no-issues-${Date.now()}`,
          kind: "no_issues",
          summary: null,
        };
      }
      setInputsLogged((list) => [...list, entry]);
      return { kind: "idle" };
    });
    refreshActiveIssues();
    refreshAircraftStatus();
  }, [poll, refreshActiveIssues, refreshAircraftStatus, revokePreviewUrls]);

  const handleEndPreflight = React.useCallback(async () => {
    if (!inProgressSession) return;
    if (inputsLogged.length === 0) return;
    setStep({ kind: "finalizing" });
    try {
      await finalizeSession(inProgressSession.id);
      router.push(`/aircraft/${aircraftId}/dashboard`);
    } catch (err) {
      toast.error("Couldn't finalize preflight", {
        description: err instanceof Error ? err.message : String(err),
      });
      setStep({ kind: "idle" });
    }
  }, [aircraftId, inProgressSession, inputsLogged.length, router]);

  const onIdle = step.kind === "idle";
  const hasInputs = inputsLogged.length > 0;

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

      {onIdle && carryCriticalIssues.length > 0 && (
        <CarryForward
          issues={carryCriticalIssues}
          onAction={handleCarryForwardAction}
          disabled={false}
          totalActiveCount={aircraftStatus?.active_issue_count}
        />
      )}

      {onIdle && hasInputs && <InProgressList inputs={inputsLogged} />}

      {onIdle &&
        (aircraftLoaded && defaultAircraft ? (
          <EntryChoice onPick={handlePick} />
        ) : (
          <p className="text-sm text-muted-foreground">Loading aircraft…</p>
        ))}

      {onIdle && (
        <div className="flex flex-col items-center gap-2 w-full max-w-sm">
          <Button
            size="lg"
            onClick={handleEndPreflight}
            disabled={!hasInputs}
            className="h-12 w-full rounded-full"
          >
            End Preflight
          </Button>
          {!hasInputs && (
            <p className="text-xs text-text-muted text-center">
              Log at least one input or use &ldquo;No issues&rdquo; to finalize.
            </p>
          )}
        </div>
      )}

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
          voiceTranscriptionId={
            step.mode === "voice" ? step.voiceTranscriptionId : undefined
          }
          sessionId={step.session.id}
          photo={step.photo}
          onDone={handleConfirmDone}
        />
      )}

      {step.kind === "finalizing" && (
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="size-6 animate-spin text-sky-500" />
          <div className="text-sm">Finalizing preflight…</div>
        </div>
      )}
    </div>
  );
}
