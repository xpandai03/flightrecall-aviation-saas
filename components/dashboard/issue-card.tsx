import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { mapSeverityToPillVariant } from "@/lib/issue-derivation";
import { StatusPill } from "@/components/dashboard/status-pill";

type Severity = "critical" | "warning" | "resolved";

interface IssueCardProps {
  title: string;
  description?: string | null;
  severity: Severity;
  history?: string;
  /** Legacy: whole card acts as one control (no expand panel). */
  onClick?: () => void;
  /** Expand/collapse row; when set with `below`, renders split layout for M3 dashboard. */
  expandable?: boolean;
  expanded?: boolean;
  onExpandToggle?: () => void;
  below?: ReactNode;
  className?: string;
}

const DOT_CLASS: Record<Severity, string> = {
  critical: "bg-status-critical",
  warning: "bg-status-warning",
  resolved: "bg-status-clear",
};

export function IssueCard({
  title,
  description,
  severity,
  history,
  onClick,
  expandable,
  expanded,
  onExpandToggle,
  below,
  className,
}: IssueCardProps) {
  const body = (
    <>
      <span
        className={cn(
          "mt-1.5 size-2 rounded-full shrink-0",
          DOT_CLASS[severity],
        )}
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-text-primary truncate">
          {title}
        </div>
        {description && (
          <div className="mt-0.5 text-xs text-text-secondary line-clamp-2">
            {description}
          </div>
        )}
        {history && (
          <div className="mt-1 text-xs text-text-muted">{history}</div>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <StatusPill variant={mapSeverityToPillVariant(severity)} />
        {expandable && onExpandToggle && (
          <ChevronDown
            className={cn(
              "size-4 text-text-muted transition-transform duration-150",
              expanded && "rotate-180",
            )}
            aria-hidden
          />
        )}
      </div>
    </>
  );

  if (expandable && onExpandToggle) {
    return (
      <div
        className={cn(
          "rounded-2xl bg-bg-card-glass border border-border-subtle shadow-card-glow w-full overflow-hidden",
          className,
        )}
      >
        <button
          type="button"
          onClick={onExpandToggle}
          aria-expanded={expanded}
          className="flex items-start gap-3 p-4 w-full text-left transition-colors hover:border-accent-teal/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-teal focus-visible:ring-inset"
        >
          {body}
        </button>
        {expanded && below ? (
          <div className="border-t border-border-subtle bg-bg-card-glass/80 px-4 py-3">
            {below}
          </div>
        ) : null}
      </div>
    );
  }

  const containerCls = cn(
    "flex items-start gap-3 rounded-2xl bg-bg-card-glass border border-border-subtle p-4 shadow-card-glow w-full text-left",
    onClick &&
      "transition-colors hover:border-accent-teal/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-teal",
    className,
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={containerCls}>
        {body}
      </button>
    );
  }
  return <div className={containerCls}>{body}</div>;
}
