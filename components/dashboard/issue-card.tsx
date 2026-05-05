import { cn } from "@/lib/utils";
import { mapSeverityToPillVariant } from "@/lib/issue-derivation";
import { StatusPill } from "@/components/dashboard/status-pill";

type Severity = "critical" | "warning" | "resolved";

interface IssueCardProps {
  title: string;
  description?: string | null;
  severity: Severity;
  history?: string;
  onClick?: () => void;
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
  className,
}: IssueCardProps) {
  const containerCls = cn(
    "flex items-start gap-3 rounded-2xl bg-bg-card-glass border border-border-subtle p-4 shadow-card-glow w-full text-left",
    onClick &&
      "transition-colors hover:border-accent-teal/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-teal",
    className,
  );

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
      <StatusPill variant={mapSeverityToPillVariant(severity)} />
    </>
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
