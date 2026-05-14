"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { ActiveIssueRow } from "@/components/memory/active-issue-row";
import { useMemoryActiveIssues } from "@/lib/use-memory-active-issues";
import type { ActiveIssueEnriched } from "@/lib/types/database";

/**
 * "All Active Issues" — full enriched active list with Still / Fixed / Skip.
 *
 * This intentionally coexists with the Memory page's **Issues** tab
 * (`fetchAircraftIssues`): that tab is a chronological archive (active +
 * resolved rows, no inline actions). This block is the management surface for
 * open issues only (`useActiveIssues`), sorted by last seen.
 */
export function ActiveIssuesSection({ aircraftId }: { aircraftId: string }) {
  const {
    critical,
    cosmetic,
    loading,
    refresh,
    optimisticallyRemove,
  } = useMemoryActiveIssues(aircraftId);

  if (loading) {
    return (
      <section
        className="rounded-xl border border-border/60 bg-card px-4 py-4"
        aria-labelledby="memory-active-issues-heading"
      >
        <h2
          id="memory-active-issues-heading"
          className="text-sm font-semibold tracking-tight text-foreground"
        >
          All Active Issues
        </h2>
        <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading…
        </div>
      </section>
    );
  }

  const emptyAll = critical.length === 0 && cosmetic.length === 0;

  return (
    <section
      className="rounded-xl border border-border/60 bg-card px-4 py-4"
      aria-labelledby="memory-active-issues-heading"
    >
      <h2
        id="memory-active-issues-heading"
        className="text-sm font-semibold tracking-tight text-foreground"
      >
        All Active Issues
      </h2>

      {emptyAll ? (
        <p className="mt-2 text-sm text-muted-foreground">
          No active issues on this aircraft.
        </p>
      ) : (
        <div className="mt-4 space-y-6">
          <MemoryActiveSubsection
            title="Critical"
            count={critical.length}
            issues={critical}
            emptyCopy="No critical issues."
            refresh={refresh}
            optimisticallyRemove={optimisticallyRemove}
          />
          <MemoryActiveSubsection
            title="Cosmetic"
            count={cosmetic.length}
            issues={cosmetic}
            emptyCopy="No cosmetic issues."
            refresh={refresh}
            optimisticallyRemove={optimisticallyRemove}
          />
        </div>
      )}
    </section>
  );
}

function MemoryActiveSubsection({
  title,
  count,
  issues,
  emptyCopy,
  refresh,
  optimisticallyRemove,
}: {
  title: string;
  count: number;
  issues: ActiveIssueEnriched[];
  emptyCopy: string;
  refresh: () => void;
  optimisticallyRemove: (issueId: string) => void;
}) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title} ({count})
      </h3>
      {issues.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyCopy}</p>
      ) : (
        <ul className="space-y-2">
          {issues.map((issue) => (
            <li key={issue.id}>
              <ActiveIssueRow
                issue={issue}
                refresh={refresh}
                optimisticallyRemove={optimisticallyRemove}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
