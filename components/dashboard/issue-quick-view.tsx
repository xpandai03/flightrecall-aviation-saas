"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ActiveIssueEnriched } from "@/lib/types/database";
import type { DashboardUrgencyAccent } from "@/lib/dashboard-issue-ranking";
import { formatIssueLastSeenLine } from "@/lib/issue-derivation";
import { cn } from "@/lib/utils";

function UrgencyBadge({ accent }: { accent: DashboardUrgencyAccent }) {
  const cls =
    accent === "high"
      ? "text-status-critical"
      : accent === "medium"
        ? "text-status-warning"
        : "text-text-muted";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium shrink-0",
        cls,
      )}
      aria-hidden
    >
      <AlertTriangle className="size-3.5" />
    </span>
  );
}

function IssueAiSummaryBlock({ issue }: { issue: ActiveIssueEnriched }) {
  const [aiSummary, setAiSummary] = useState(issue.ai_summary);
  const [aiUpdatedAt, setAiUpdatedAt] = useState(issue.ai_summary_updated_at);

  useEffect(() => {
    setAiSummary(issue.ai_summary);
    setAiUpdatedAt(issue.ai_summary_updated_at);
  }, [issue.id, issue.ai_summary, issue.ai_summary_updated_at]);

  useEffect(() => {
    if (aiSummary != null) return;
    if (aiUpdatedAt != null) return;

    const started = Date.now();
    const id = issue.id;
    let interval: ReturnType<typeof setInterval>;
    const tick = async () => {
      if (Date.now() - started >= 30_000) {
        clearInterval(interval);
        return;
      }
      try {
        const r = await fetch(`/api/v1/issues/${id}/summary`);
        if (!r.ok) return;
        const j = (await r.json()) as {
          ai_summary: string | null;
          ai_summary_updated_at: string | null;
        };
        if (j.ai_summary) {
          setAiSummary(j.ai_summary);
          setAiUpdatedAt(j.ai_summary_updated_at);
          clearInterval(interval);
        } else if (j.ai_summary_updated_at) {
          setAiUpdatedAt(j.ai_summary_updated_at);
          clearInterval(interval);
        }
      } catch {
        // transient network errors — next tick retries until cap
      }
    };
    void tick();
    interval = setInterval(tick, 2000);
    return () => clearInterval(interval);
  }, [issue.id, aiSummary, aiUpdatedAt]);

  if (aiSummary) {
    return (
      <div className="rounded-md bg-bg-elevated/60 border border-border-subtle px-3 py-2 space-y-1">
        <p className="text-xs text-text-primary leading-relaxed">{aiSummary}</p>
        <p className="text-[10px] text-text-muted">AI-generated summary</p>
      </div>
    );
  }

  if (!aiUpdatedAt) {
    return (
      <div
        className="flex items-center gap-2 text-xs text-text-muted"
        aria-live="polite"
      >
        <Loader2 className="size-3.5 animate-spin shrink-0" aria-hidden />
        <span>Generating summary…</span>
      </div>
    );
  }

  return (
    <p className="text-xs text-text-muted leading-relaxed">
      No short summary yet. Recurrence and recency below stay current.
    </p>
  );
}

export function IssueQuickView({
  issue,
  urgencyAccent,
  aircraftId,
  onClose,
}: {
  issue: ActiveIssueEnriched;
  urgencyAccent: DashboardUrgencyAccent;
  aircraftId: string;
  onClose: () => void;
}) {
  const typeName = issue.issue_type?.name ?? "Unknown issue";
  const locationLabel = issue.location?.trim() || "Location not specified";
  const n = issue.recurrence_count;
  const detailHref = issue.originating_session_id
    ? `/aircraft/${aircraftId}/sessions?session=${issue.originating_session_id}`
    : null;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-text-primary">{typeName}</h3>
            <UrgencyBadge accent={urgencyAccent} />
          </div>
          <p className="text-xs text-text-secondary mt-0.5">{locationLabel}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-text-muted hover:text-text-primary hover:bg-bg-base shrink-0"
          aria-label="Close details"
        >
          <X className="size-4" />
        </button>
      </div>

      <IssueAiSummaryBlock issue={issue} />

      <dl className="grid gap-1 text-xs text-text-secondary">
        <div>
          <dt className="inline text-text-muted">Recurrence: </dt>
          <dd className="inline text-text-primary">
            Logged {n} {n === 1 ? "time" : "times"}
          </dd>
        </div>
        <div>
          <dt className="inline text-text-muted">Recency: </dt>
          <dd className="inline text-text-primary">
            {formatIssueLastSeenLine(issue.flights_since)}
          </dd>
        </div>
      </dl>
      {detailHref ? (
        <Button
          asChild
          variant="secondary"
          size="sm"
          className="w-full rounded-full"
        >
          <Link href={detailHref}>View in detail</Link>
        </Button>
      ) : null}
    </div>
  );
}
