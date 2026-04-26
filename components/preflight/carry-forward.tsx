"use client";

import * as React from "react";
import { AlertTriangle, Check, MinusCircle } from "lucide-react";
import type { ActiveIssue, IssueAction } from "@/lib/types/database";

const MAX_DISPLAYED = 5;

type PendingAction = Exclude<IssueAction, "logged">;

export function CarryForward({
  issues,
  pendingActions,
  onAction,
  disabled,
  totalActiveCount,
}: {
  issues: ActiveIssue[];
  pendingActions: Map<string, PendingAction>;
  onAction: (issueId: string, action: PendingAction) => void;
  disabled?: boolean;
  totalActiveCount?: number;
}) {
  if (issues.length === 0) return null;
  const overflow = (totalActiveCount ?? issues.length) - issues.length;
  return (
    <div className="w-full max-w-md rounded-2xl border border-amber-200/70 bg-amber-50/40 px-4 py-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-amber-800 mb-3">
        <AlertTriangle className="size-3.5" />
        Active issues ({totalActiveCount ?? issues.length})
      </div>
      <ul className="space-y-3">
        {issues.slice(0, MAX_DISPLAYED).map((issue) => (
          <CarryForwardRow
            key={issue.id}
            issue={issue}
            pending={pendingActions.get(issue.id) ?? null}
            onAction={onAction}
            disabled={disabled}
          />
        ))}
      </ul>
      {overflow > 0 && (
        <div className="mt-3 text-[11px] text-muted-foreground text-right">
          + {overflow} more in <a className="underline" href="/memory">/memory</a>
        </div>
      )}
    </div>
  );
}

function CarryForwardRow({
  issue,
  pending,
  onAction,
  disabled,
}: {
  issue: ActiveIssue;
  pending: PendingAction | null;
  onAction: (issueId: string, action: PendingAction) => void;
  disabled?: boolean;
}) {
  const dim = pending !== null;
  return (
    <li
      className={`rounded-xl border border-border/60 bg-card px-3 py-3 transition-opacity ${dim ? "opacity-90" : ""}`}
    >
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <div>
          <div className="text-sm font-semibold tracking-tight">
            {issue.issue_type.name}
          </div>
          <div className="text-[11px] text-muted-foreground">
            Seen {issue.flights_since}{" "}
            {issue.flights_since === 1 ? "flight" : "flights"} ago
          </div>
        </div>
        {pending && <PendingBadge action={pending} />}
      </div>
      <div className="flex items-center gap-1.5">
        <ActionPill
          action="still"
          label="Still present"
          selected={pending === "still"}
          disabled={disabled}
          onClick={() => onAction(issue.id, "still")}
        />
        <ActionPill
          action="fixed"
          label="Fixed"
          selected={pending === "fixed"}
          disabled={disabled}
          onClick={() => onAction(issue.id, "fixed")}
        />
        <ActionPill
          action="skipped"
          label="Skip"
          selected={pending === "skipped"}
          disabled={disabled}
          onClick={() => onAction(issue.id, "skipped")}
        />
      </div>
    </li>
  );
}

function ActionPill({
  action,
  label,
  selected,
  onClick,
  disabled,
}: {
  action: PendingAction;
  label: string;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  const baseStyle =
    "inline-flex items-center justify-center rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors min-h-[36px]";
  const selectedStyle =
    action === "still"
      ? "bg-sky-600 border-sky-600 text-white hover:bg-sky-700"
      : action === "fixed"
        ? "bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700"
        : "bg-muted border-muted text-foreground/70";
  const idleStyle = "bg-background border-border text-foreground hover:bg-accent";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyle} ${selected ? selectedStyle : idleStyle} disabled:opacity-50`}
    >
      {label}
    </button>
  );
}

function PendingBadge({ action }: { action: PendingAction }) {
  const map = {
    still: { icon: <Check className="size-3" />, label: "Still", cls: "bg-sky-50 text-sky-700 border-sky-200" },
    fixed: { icon: <Check className="size-3" />, label: "Fixed", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    skipped: { icon: <MinusCircle className="size-3" />, label: "Skipped", cls: "bg-muted text-muted-foreground border-border" },
  } as const;
  const v = map[action];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${v.cls}`}
    >
      {v.icon}
      {v.label}
    </span>
  );
}
