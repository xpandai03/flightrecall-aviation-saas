"use client";

import * as React from "react";
import type {
  ActiveIssue,
  AircraftIssuesResponse,
  AircraftStatus,
  IssueAction,
  IssueObservation,
  IssueWithType,
} from "@/lib/types/database";

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: "no-store", ...init });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`${init?.method ?? "GET"} ${url} → ${r.status}: ${text}`);
  }
  return r.json() as Promise<T>;
}

export function fetchAircraftStatus(aircraftId: string): Promise<AircraftStatus> {
  return jsonFetch<AircraftStatus>(`/api/v1/aircraft/${aircraftId}/status`);
}

export function fetchActiveIssues(aircraftId: string): Promise<ActiveIssue[]> {
  return jsonFetch<ActiveIssue[]>(
    `/api/v1/aircraft/${aircraftId}/active-issues`,
  );
}

export function fetchAircraftIssues(
  aircraftId: string,
): Promise<AircraftIssuesResponse> {
  return jsonFetch<AircraftIssuesResponse>(
    `/api/v1/aircraft/${aircraftId}/issues`,
  );
}

export function postIssueObservation(
  issueId: string,
  body: {
    action: Exclude<IssueAction, "logged">;
    preflight_session_id?: string;
  },
): Promise<{ observation: IssueObservation | null; issue: IssueWithType }> {
  return jsonFetch(`/api/v1/issues/${issueId}/observations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Hooks ----------------------------------------------------------------

export function useAircraftStatus(aircraftId: string | null): {
  status: AircraftStatus | null;
  loading: boolean;
  refresh: () => void;
} {
  const [status, setStatus] = React.useState<AircraftStatus | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    if (!aircraftId) return;
    let cancelled = false;
    setLoading(true);
    fetchAircraftStatus(aircraftId)
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch(() => {
        // Silent — caller decides whether to surface
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [aircraftId, tick]);

  return { status, loading, refresh: () => setTick((t) => t + 1) };
}

export function useActiveIssues(aircraftId: string | null): {
  issues: ActiveIssue[];
  loading: boolean;
  refresh: () => void;
  optimisticallyRemove: (issueId: string) => void;
} {
  const [issues, setIssues] = React.useState<ActiveIssue[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    if (!aircraftId) return;
    let cancelled = false;
    setLoading(true);
    fetchActiveIssues(aircraftId)
      .then((rows) => {
        if (!cancelled) setIssues(rows);
      })
      .catch(() => {
        if (!cancelled) setIssues([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [aircraftId, tick]);

  const optimisticallyRemove = React.useCallback((issueId: string) => {
    setIssues((prev) => prev.filter((i) => i.id !== issueId));
  }, []);

  return {
    issues,
    loading,
    refresh: () => setTick((t) => t + 1),
    optimisticallyRemove,
  };
}
