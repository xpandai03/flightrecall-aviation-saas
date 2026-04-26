"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Plane,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listAircraft, listSessions } from "@/lib/api/sessions";
import { fetchAircraftIssues } from "@/lib/api/issues";
import type {
  Aircraft,
  AircraftIssuesResponse,
  IssueWithType,
  PreflightSessionWithMedia,
  StatusColor,
} from "@/lib/types/database";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function MemoryPage() {
  const params = useParams<{ id: string }>();
  const aircraftId = params.id;

  const [aircraft, setAircraft] = React.useState<Aircraft | null>(null);
  const [sessions, setSessions] = React.useState<PreflightSessionWithMedia[]>([]);
  const [issues, setIssues] = React.useState<AircraftIssuesResponse>({
    active: [],
    resolved: [],
  });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!aircraftId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const acft = await listAircraft();
        if (cancelled) return;
        const match = acft.find((a) => a.id === aircraftId) ?? null;
        setAircraft(match);
        if (!match) {
          setLoading(false);
          return;
        }
        const [ses, iss] = await Promise.all([
          listSessions({ aircraftId: match.id, limit: 100 }),
          fetchAircraftIssues(match.id),
        ]);
        if (cancelled) return;
        setSessions(ses);
        setIssues(iss);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [aircraftId]);

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Memory</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Past sessions and tracked issues for{" "}
          {aircraft ? aircraft.tail_number : "—"}.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading…
        </div>
      ) : (
        <Tabs defaultValue="sessions" className="w-full">
          <TabsList>
            <TabsTrigger value="sessions">
              Sessions <span className="ml-1.5 text-xs opacity-60">{sessions.length}</span>
            </TabsTrigger>
            <TabsTrigger value="issues">
              Issues{" "}
              <span className="ml-1.5 text-xs opacity-60">
                {issues.active.length + issues.resolved.length}
              </span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sessions" className="mt-4">
            <SessionsList sessions={sessions} />
          </TabsContent>

          <TabsContent value="issues" className="mt-4">
            <IssuesList issues={issues} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function SessionsList({
  sessions,
}: {
  sessions: PreflightSessionWithMedia[];
}) {
  if (sessions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No sessions yet.</p>
    );
  }
  return (
    <ul className="divide-y divide-border/60 rounded-xl border border-border/60 bg-card">
      {sessions.map((s) => (
        <li key={s.id} className="flex items-center gap-3 px-4 py-3">
          <span className="flex size-7 items-center justify-center rounded-md bg-sky-50 text-sky-600 shrink-0">
            <Plane className="size-3.5 -rotate-45" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-sm font-medium">{formatDate(s.created_at)}</span>
              <span className="text-xs text-muted-foreground">
                {formatTime(s.created_at)}
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <InputTypeChip inputType={s.input_type} />
              <StatusDot color={s.status_color} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function IssuesList({ issues }: { issues: AircraftIssuesResponse }) {
  if (issues.active.length === 0 && issues.resolved.length === 0) {
    return <p className="text-sm text-muted-foreground">No issues tracked yet.</p>;
  }
  return (
    <div className="space-y-6">
      <IssueSection
        title="Active"
        icon={<AlertTriangle className="size-3.5 text-amber-500" />}
        rows={issues.active}
        emptyCopy="No active issues."
        timestampLabel="Last seen"
        timestampField="last_seen_at"
      />
      <IssueSection
        title="Resolved"
        icon={<CheckCircle2 className="size-3.5 text-emerald-500" />}
        rows={issues.resolved}
        emptyCopy="No resolved issues yet."
        timestampLabel="Resolved"
        timestampField="resolved_at"
      />
    </div>
  );
}

function IssueSection({
  title,
  icon,
  rows,
  emptyCopy,
  timestampLabel,
  timestampField,
}: {
  title: string;
  icon: React.ReactNode;
  rows: IssueWithType[];
  emptyCopy: string;
  timestampLabel: string;
  timestampField: "last_seen_at" | "resolved_at";
}) {
  return (
    <section>
      <h2 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
        {icon}
        {title} ({rows.length})
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyCopy}</p>
      ) : (
        <ul className="divide-y divide-border/60 rounded-xl border border-border/60 bg-card">
          {rows.map((issue) => {
            const ts = issue[timestampField];
            return (
              <li key={issue.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium tracking-tight">
                    {issue.issue_type.name}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                    <Clock className="size-3" />
                    {timestampLabel} {ts ? formatDate(ts) : "—"}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function InputTypeChip({ inputType }: { inputType: string }) {
  const label =
    inputType === "voice"
      ? "Voice"
      : inputType === "photo"
        ? "Photo"
        : "No issues";
  return (
    <Badge
      variant="secondary"
      className="bg-muted text-foreground/80 hover:bg-muted text-[10px] uppercase tracking-wide"
    >
      {label}
    </Badge>
  );
}

function StatusDot({ color }: { color: StatusColor | null }) {
  if (!color) return null;
  const dotClass =
    color === "green"
      ? "bg-emerald-500"
      : color === "yellow"
        ? "bg-amber-500"
        : "bg-rose-500";
  const labelClass =
    color === "green"
      ? "text-emerald-700"
      : color === "yellow"
        ? "text-amber-700"
        : "text-rose-700";
  const label =
    color === "green" ? "All clear" : color === "yellow" ? "Watch" : "Action needed";
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${labelClass}`}>
      <span className={`size-1.5 rounded-full ${dotClass}`} />
      {label}
    </span>
  );
}
