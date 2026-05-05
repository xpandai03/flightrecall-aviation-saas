"use client";

import * as React from "react";
import {
  CheckCircle2,
  Plane,
  AlertTriangle,
  Loader2,
  SearchX,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EditableTranscript } from "@/components/editable-transcript";
import { PhotoLightbox } from "@/components/photo-lightbox";
import { ExtractedIssueRow } from "@/components/preflight/extracted-issue-row";
import { deleteIssue, fetchIssueTypes } from "@/lib/api/issues";
import { getSessionIssues, type SessionIssue } from "@/lib/api/sessions";
import type {
  InputType,
  IssueType,
  IssueWithType,
  QuickTag,
  StatusColor,
} from "@/lib/types/database";
import type { PollResult } from "@/hooks/use-transcription-poll";

export type ConfirmationProps = {
  inputType: InputType;
  aircraftTail: string;
  createdAtIso: string;
  statusColor: StatusColor | null;
  // voice-only
  poll?: PollResult;
  voiceTranscriptionId?: string;
  sessionId?: string;
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
  voiceTranscriptionId,
  sessionId,
  photo,
  onDone,
}: ConfirmationProps) {
  const isVoice = inputType === "voice";
  const voiceContentReady = Boolean(
    poll &&
      (poll.phase === "completed" ||
        poll.phase === "failed" ||
        poll.phase === "timed_out"),
  );
  // For voice we render an empty placeholder card while polling — no
  // "Transcribing…" copy. The session is already saved (toast fired
  // upstream); the transcript fills in when the poll completes.
  const showVoicePanel = isVoice && voiceContentReady;
  const showVoiceEmpty = isVoice && !voiceContentReady;
  const showExtractedPanel =
    isVoice && poll?.phase === "completed" && Boolean(sessionId);

  return (
    <div className="w-full max-w-md flex flex-col items-center gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <CheckCircle2 className="size-5" />
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

        {showVoicePanel && poll && (
          <VoicePanel
            poll={poll}
            voiceTranscriptionId={voiceTranscriptionId}
          />
        )}

        {showVoiceEmpty && <div aria-hidden className="min-h-[5rem]" />}

        {inputType === "photo" && photo && (
          <PhotoPanel previewUrl={photo.previewUrl} quickTag={photo.quickTag} />
        )}
      </div>

      {showExtractedPanel && sessionId && (
        <ExtractedIssuesPanel sessionId={sessionId} />
      )}

      <div className="flex flex-col items-center gap-1.5">
        <Button size="lg" onClick={onDone} className="rounded-full px-8 h-11">
          Done
        </Button>
        {showExtractedPanel && (
          <p className="text-[11px] text-muted-foreground">
            Issues already saved — Done returns to preflight.
          </p>
        )}
      </div>
    </div>
  );
}

function VoicePanel({
  poll,
  voiceTranscriptionId,
}: {
  poll: PollResult;
  voiceTranscriptionId?: string;
}) {
  if (poll.phase === "completed" && poll.transcript_text !== null) {
    if (voiceTranscriptionId) {
      return (
        <EditableTranscript
          transcriptionId={voiceTranscriptionId}
          initialText={poll.transcript_text}
        />
      );
    }
    // Defensive fallback: no id threaded through (shouldn't happen in
    // the live flow, but keeps the component safe to mount in tests
    // or future surfaces).
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

  return null;
}

// ---------------------------------------------------------------------
// ExtractedIssuesPanel — audit-and-edit surface for the issues that
// the M2 Phase 2 keyword extractor wrote to the DB on transcription
// complete. The issues already exist; this is not a preview.
//
// Race handling: extraction lands a moment after the transcription
// row flips to 'completed', so the first fetch may return []. We
// re-poll up to 3 times at 1500ms intervals (~5s window) before
// rendering the empty state. After that, if the user is still
// looking, the panel is stable — they can re-record if they
// expected something to surface.
// ---------------------------------------------------------------------

const ISSUE_POLL_INTERVAL_MS = 1500;
const ISSUE_POLL_MAX_ATTEMPTS = 3;

function ExtractedIssuesPanel({ sessionId }: { sessionId: string }) {
  const [items, setItems] = React.useState<SessionIssue[]>([]);
  const [issueTypes, setIssueTypes] = React.useState<IssueType[]>([]);
  const [phase, setPhase] = React.useState<"loading" | "ready" | "empty">(
    "loading",
  );
  const [removingIds, setRemovingIds] = React.useState<Set<string>>(
    () => new Set(),
  );

  React.useEffect(() => {
    let cancelled = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    fetchIssueTypes()
      .then((types) => {
        if (!cancelled) setIssueTypes(types);
      })
      .catch(() => {
        // Non-fatal: edit dropdowns will be empty until refetch on
        // next mount. View mode still works.
      });

    const tick = async () => {
      attempt += 1;
      try {
        const rows = await getSessionIssues(sessionId);
        if (cancelled) return;
        if (rows.length > 0) {
          setItems(rows);
          setPhase("ready");
          return;
        }
        if (attempt >= ISSUE_POLL_MAX_ATTEMPTS) {
          setItems([]);
          setPhase("empty");
          return;
        }
        timer = setTimeout(tick, ISSUE_POLL_INTERVAL_MS);
      } catch {
        if (cancelled) return;
        if (attempt >= ISSUE_POLL_MAX_ATTEMPTS) {
          setPhase("empty");
          return;
        }
        timer = setTimeout(tick, ISSUE_POLL_INTERVAL_MS);
      }
    };

    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [sessionId]);

  const handleUpdated = (next: IssueWithType) => {
    setItems((prev) =>
      prev.map((it) => (it.issue.id === next.id ? { ...it, issue: next } : it)),
    );
  };

  const handleRemoveRequest = async (issueId: string) => {
    if (removingIds.has(issueId)) return;
    setRemovingIds((prev) => {
      const next = new Set(prev);
      next.add(issueId);
      return next;
    });
    // Optimistic: remove from the visible list immediately.
    const previousItems = items;
    setItems((prev) => prev.filter((it) => it.issue.id !== issueId));
    try {
      await deleteIssue(issueId);
      // Success — list already reflects the removal.
      toast.success("Issue removed.");
    } catch {
      // Rollback.
      setItems(previousItems);
      toast.error("Couldn't remove issue. Try again.");
    } finally {
      setRemovingIds((prev) => {
        const next = new Set(prev);
        next.delete(issueId);
        return next;
      });
    }
  };

  if (phase === "loading") {
    return (
      <div className="w-full rounded-2xl border border-border/80 bg-card px-5 py-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Analyzing transcript…
        </div>
      </div>
    );
  }

  if (phase === "empty") {
    return (
      <div className="w-full rounded-2xl border border-border/80 bg-card px-5 py-4">
        <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
          <SearchX className="size-4 shrink-0" />
          <span>No issues extracted from this transcript.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full rounded-2xl border border-border/80 bg-card px-5 py-4 space-y-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Extracted issues this preflight ({items.length})
      </div>
      <div className="space-y-2">
        {items.map((it) => (
          <ExtractedIssueRow
            key={it.observation_id}
            issue={it.issue}
            issueTypes={issueTypes}
            onUpdated={handleUpdated}
            onRemoveRequest={handleRemoveRequest}
            removing={removingIds.has(it.issue.id)}
          />
        ))}
      </div>
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
  const [lightboxOpen, setLightboxOpen] = React.useState(false);
  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => setLightboxOpen(true)}
        className="size-20 rounded-lg overflow-hidden bg-muted ring-1 ring-border/60 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        aria-label="Open photo full screen"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewUrl}
          alt="Captured photo"
          className="w-full h-full object-cover"
        />
      </button>
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
      <PhotoLightbox
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        src={previewUrl}
        alt="Captured photo"
      />
    </div>
  );
}
