"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";

import type { ActiveIssueEnriched, IssueAction } from "@/lib/types/database";
import { cn } from "@/lib/utils";

type PendingAction = Exclude<IssueAction, "logged">;

export function CosmeticIssuesBucket({
  issues,
  onAction,
  disabled,
}: {
  issues: ActiveIssueEnriched[];
  onAction: (
    issueId: string,
    action: PendingAction,
  ) => void | Promise<void>;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  if (issues.length === 0) return null;

  return (
    <div className="w-full max-w-md rounded-2xl border border-border-subtle bg-bg-card-glass shadow-card-glow overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-bg-base/50"
      >
        <span className="text-sm font-semibold text-text-primary">
          Cosmetic issues ({issues.length})
        </span>
        <ChevronDown
          className={cn(
            "size-4 text-text-muted shrink-0 transition-transform duration-150",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {open && (
        <ul className="border-t border-border-subtle px-3 py-2 space-y-2">
          {issues.map((issue) => (
            <CosmeticRow
              key={issue.id}
              issue={issue}
              onAction={onAction}
              disabled={disabled}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function CosmeticRow({
  issue,
  onAction,
  disabled,
}: {
  issue: ActiveIssueEnriched;
  onAction: (
    issueId: string,
    action: PendingAction,
  ) => void | Promise<void>;
  disabled?: boolean;
}) {
  const [busy, setBusy] = React.useState(false);
  const handle = async (action: PendingAction) => {
    if (busy) return;
    setBusy(true);
    try {
      await Promise.resolve(onAction(issue.id, action));
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="rounded-xl border border-border-subtle bg-bg-card px-3 py-3">
      <div className="mb-2">
        <div className="text-sm font-semibold tracking-tight text-text-primary">
          {issue.issue_type.name}
          {issue.location && (
            <span className="text-text-secondary font-normal">
              {" "}
              — {issue.location}
            </span>
          )}
        </div>
        <div className="text-[11px] text-text-secondary">
          Seen {issue.flights_since}{" "}
          {issue.flights_since === 1 ? "flight" : "flights"} ago
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <ActionPill
          label="Still present"
          onClick={() => handle("still")}
          disabled={disabled || busy}
        />
        <ActionPill
          label="Fixed"
          onClick={() => handle("fixed")}
          disabled={disabled || busy}
        />
        <ActionPill
          label="Skip"
          onClick={() => handle("skipped")}
          disabled={disabled || busy}
        />
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
