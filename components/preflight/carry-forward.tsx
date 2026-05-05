"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import type { ActiveIssue, IssueAction } from "@/lib/types/database";

const MAX_DISPLAYED = 5;

type PendingAction = Exclude<IssueAction, "logged">;

export function CarryForward({
  issues,
  onAction,
  disabled,
  totalActiveCount,
}: {
  issues: ActiveIssue[];
  onAction: (issueId: string, action: PendingAction) => void;
  disabled?: boolean;
  totalActiveCount?: number;
}) {
  if (issues.length === 0) return null;
  const overflow = (totalActiveCount ?? issues.length) - issues.length;
  return (
    <div className="w-full max-w-md rounded-2xl border border-status-warning/40 bg-status-warning/10 px-4 py-4 shadow-card-glow">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-status-warning mb-3">
        <AlertTriangle className="size-3.5" />
        Active issues ({totalActiveCount ?? issues.length})
      </div>
      <ul className="space-y-3">
        {issues.slice(0, MAX_DISPLAYED).map((issue) => (
          <CarryForwardRow
            key={issue.id}
            issue={issue}
            onAction={onAction}
            disabled={disabled}
          />
        ))}
      </ul>
      {overflow > 0 && (
        <div className="mt-3 text-[11px] text-text-muted text-right">
          + {overflow} more in{" "}
          <a className="text-accent-mint hover:underline" href="/memory">
            /memory
          </a>
        </div>
      )}
    </div>
  );
}

function CarryForwardRow({
  issue,
  onAction,
  disabled,
}: {
  issue: ActiveIssue;
  onAction: (issueId: string, action: PendingAction) => void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = React.useState(false);
  const handle = (action: PendingAction) => {
    if (busy) return;
    setBusy(true);
    onAction(issue.id, action);
  };
  return (
    <li className="rounded-xl border border-border-subtle bg-bg-card px-3 py-3">
      <div className="mb-2">
        <div className="text-sm font-semibold tracking-tight text-text-primary">
          {issue.issue_type.name}
        </div>
        <div className="text-[11px] text-text-secondary">
          Seen {issue.flights_since}{" "}
          {issue.flights_since === 1 ? "flight" : "flights"} ago
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <ActionPill label="Still present" onClick={() => handle("still")} disabled={disabled || busy} />
        <ActionPill label="Fixed" onClick={() => handle("fixed")} disabled={disabled || busy} />
        <ActionPill label="Skip" onClick={() => handle("skipped")} disabled={disabled || busy} />
      </div>
    </li>
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
      className="inline-flex items-center justify-center rounded-full border border-border-subtle bg-bg-base px-3 py-1.5 text-[12px] font-medium text-text-primary transition-colors hover:border-accent-teal/40 hover:bg-bg-card disabled:opacity-50 min-h-[36px]"
    >
      {label}
    </button>
  );
}
