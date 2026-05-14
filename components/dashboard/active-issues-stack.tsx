"use client";

import * as React from "react";

import { IssueCard } from "@/components/dashboard/issue-card";
import { IssueQuickView } from "@/components/dashboard/issue-quick-view";
import {
  compareCriticalIssuesEnriched,
  daysSince,
  deriveDashboardUrgencyAccent,
} from "@/lib/dashboard-issue-ranking";
import {
  deriveIssueSeverity,
  formatIssueHistory,
} from "@/lib/issue-derivation";
import type { ActiveIssueEnriched } from "@/lib/types/database";

export function ActiveIssuesStack({
  aircraftId,
  issues,
}: {
  aircraftId: string;
  issues: ActiveIssueEnriched[];
}) {
  const [openId, setOpenId] = React.useState<string | null>(null);
  const rootRef = React.useRef<HTMLUListElement>(null);

  React.useEffect(() => {
    if (!openId) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = rootRef.current;
      if (!el || el.contains(e.target as Node)) return;
      setOpenId(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [openId]);

  const nowMs = Date.now();

  const sorted = React.useMemo(() => {
    return [...issues].sort((a, b) =>
      compareCriticalIssuesEnriched(a, b, nowMs),
    );
  }, [issues, nowMs]);

  return (
    <ul ref={rootRef} className="flex flex-col gap-2">
      {sorted.map((issue) => {
        const expanded = openId === issue.id;
        const d = daysSince(issue.last_seen_at, nowMs);
        const accent = deriveDashboardUrgencyAccent({
          recurrenceCount: issue.recurrence_count,
          flightsSince: issue.flights_since,
          daysSinceSeen: d,
        });
        return (
          <li key={issue.id}>
            <IssueCard
              title={issue.issue_type?.name ?? "Unknown issue"}
              description={issue.description}
              severity={deriveIssueSeverity(issue)}
              history={formatIssueHistory({
                flights_since: issue.flights_since,
              })}
              expandable
              expanded={expanded}
              onExpandToggle={() =>
                setOpenId((prev) => (prev === issue.id ? null : issue.id))
              }
              below={
                <IssueQuickView
                  issue={issue}
                  urgencyAccent={accent}
                  aircraftId={aircraftId}
                  onClose={() => setOpenId(null)}
                />
              }
            />
          </li>
        );
      })}
    </ul>
  );
}
