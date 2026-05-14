"use client";

import * as React from "react";

import { useActiveIssues } from "@/lib/api/issues";
import type { ActiveIssueEnriched } from "@/lib/types/database";

/**
 * Memory tab shows every active issue sorted by recency (`last_seen_at` DESC).
 * The active-issues API ranks critical issues for the dashboard; we re-sort
 * critical client-side here without changing the route.
 */
export function sortActiveIssuesByLastSeenDesc(
  issues: ActiveIssueEnriched[],
): ActiveIssueEnriched[] {
  return [...issues].sort(
    (a, b) =>
      new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime(),
  );
}

/**
 * Active-issue buckets for Memory's "All Active Issues" block — same payload
 * as preflight/dashboard `useActiveIssues`, with critical re-ordered for
 * recency-only display.
 */
export function useMemoryActiveIssues(aircraftId: string | null): {
  critical: ActiveIssueEnriched[];
  cosmetic: ActiveIssueEnriched[];
  loading: boolean;
  refresh: () => void;
  optimisticallyRemove: (issueId: string) => void;
} {
  const { critical, cosmetic, loading, refresh, optimisticallyRemove } =
    useActiveIssues(aircraftId);

  const criticalSorted = React.useMemo(
    () => sortActiveIssuesByLastSeenDesc(critical),
    [critical],
  );

  const cosmeticSorted = React.useMemo(
    () => sortActiveIssuesByLastSeenDesc(cosmetic),
    [cosmetic],
  );

  return {
    critical: criticalSorted,
    cosmetic: cosmeticSorted,
    loading,
    refresh,
    optimisticallyRemove,
  };
}
