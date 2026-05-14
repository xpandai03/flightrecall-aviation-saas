import Link from "next/link";
import { AlertTriangle, X } from "lucide-react";

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
