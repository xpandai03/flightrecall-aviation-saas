"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { postIssueObservation } from "@/lib/api/issues";
import {
  daysSince,
  deriveDashboardUrgencyAccent,
} from "@/lib/dashboard-issue-ranking";
import { formatIssueLastSeenLine } from "@/lib/issue-derivation";
import type { ActiveIssueEnriched, IssueAction } from "@/lib/types/database";
import { cn } from "@/lib/utils";

type PendingAction = Exclude<IssueAction, "logged">;

const FIXED_HOLD_MS = 600;
const FADE_MS = 350;
const INLINE_PILL_MS = 800;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function failureToast(action: PendingAction): void {
  if (action === "fixed") {
    toast.error("Couldn't mark as fixed. Try again.");
    return;
  }
  if (action === "still") {
    toast.error("Couldn't update issue. Try again.");
    return;
  }
  toast.error("Couldn't skip. Try again.");
}

export function ActiveIssueRow({
  issue,
  refresh,
  optimisticallyRemove,
}: {
  issue: ActiveIssueEnriched;
  refresh: () => void;
  optimisticallyRemove: (issueId: string) => void;
}) {
  const inFlight = React.useRef(false);
  const mounted = React.useRef(true);
  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const [busy, setBusy] = React.useState(false);
  const [fixedVisual, setFixedVisual] = React.useState(false);
  const [fadeOut, setFadeOut] = React.useState(false);
  const [inlinePill, setInlinePill] = React.useState<
    "Updated" | "Skipped" | null
  >(null);

  const nowMs = Date.now();
  const accent = deriveDashboardUrgencyAccent({
    recurrenceCount: issue.recurrence_count,
    flightsSince: issue.flights_since,
    daysSinceSeen: daysSince(issue.last_seen_at, nowMs),
  });

  const accentBar =
    accent === "high"
      ? "border-l-status-critical"
      : accent === "medium"
        ? "border-l-status-warning"
        : "border-l-border-subtle";

  const typeName = issue.issue_type?.name ?? "Unknown issue";
  const locationLabel =
    issue.location?.trim() && issue.location.trim().length > 0
      ? issue.location.trim()
      : "Not specified";
  const n = issue.recurrence_count;
  const recurrenceLabel = `Logged ${n} ${n === 1 ? "time" : "times"}`;

  const runFixed = React.useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFixedVisual(true);
    try {
      await postIssueObservation(issue.id, { action: "fixed" });
    } catch {
      failureToast("fixed");
      setFixedVisual(false);
      setBusy(false);
      inFlight.current = false;
      return;
    }
    await delay(FIXED_HOLD_MS);
    setFadeOut(true);
    await delay(FADE_MS);
    optimisticallyRemove(issue.id);
    refresh();
    inFlight.current = false;
    if (mounted.current) {
      setBusy(false);
      setFixedVisual(false);
      setFadeOut(false);
    }
  }, [issue.id, optimisticallyRemove, refresh]);

  const runStillOrSkip = React.useCallback(
    async (action: "still" | "skipped") => {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusy(true);
      try {
        await postIssueObservation(issue.id, { action });
      } catch {
        failureToast(action);
        setBusy(false);
        inFlight.current = false;
        return;
      }
      setInlinePill(action === "still" ? "Updated" : "Skipped");
      await delay(INLINE_PILL_MS);
      setInlinePill(null);
      refresh();
      setBusy(false);
      inFlight.current = false;
    },
    [issue.id, refresh],
  );

  const showActions = !fixedVisual && !inlinePill;

  return (
    <div
      className={cn(
        "rounded-xl border bg-bg-card px-3 py-3 transition-opacity duration-300 border-l-4",
        accentBar,
        fixedVisual && "opacity-75",
        fadeOut && "opacity-0",
        "border-border-subtle",
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <span
              className={cn(
                "mt-0.5 shrink-0",
                accent === "high" && "text-status-critical",
                accent === "medium" && "text-status-warning",
                accent === "low" && "text-text-muted",
              )}
              aria-hidden
            >
              <AlertTriangle className="size-3.5" />
            </span>
            <div className="min-w-0 space-y-1">
              <div className="text-sm font-semibold tracking-tight text-text-primary truncate">
                {typeName}
              </div>
              <p className="text-xs text-text-secondary">{locationLabel}</p>
              <p className="text-[11px] text-text-secondary">
                {recurrenceLabel}
                <span className="text-text-muted"> · </span>
                {formatIssueLastSeenLine(issue.flights_since)}
              </p>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end sm:pt-0.5">
          {fixedVisual && (
            <span className="inline-flex items-center justify-center gap-1 rounded-full border border-border-subtle bg-bg-base px-3 py-1.5 text-[12px] font-medium text-text-primary">
              Fixed ✓
            </span>
          )}
          {inlinePill && (
            <span className="inline-flex items-center justify-center rounded-full border border-border-subtle bg-bg-base px-3 py-1.5 text-[12px] font-medium text-text-primary">
              {inlinePill}
            </span>
          )}
          {showActions && (
            <div className="flex flex-wrap items-center gap-1.5">
              <ActionPill
                label="Still"
                onClick={() => void runStillOrSkip("still")}
                disabled={busy}
              />
              <ActionPill
                label="Fixed"
                onClick={() => void runFixed()}
                disabled={busy}
              />
              <ActionPill
                label="Skip"
                onClick={() => void runStillOrSkip("skipped")}
                disabled={busy}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionPill({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-[36px] items-center justify-center rounded-full border border-border-subtle bg-bg-base px-3 py-1.5 text-[12px] font-medium text-text-primary transition-colors hover:border-accent-teal/40 hover:bg-bg-card disabled:opacity-50"
    >
      {label}
    </button>
  );
}
