import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Camera,
  CheckCircle2,
  ChevronRight,
  Mic,
  Plane,
} from "lucide-react";
import { z } from "zod";

import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { computeStatusColor } from "@/lib/status-color";
import { createClient } from "@/utils/supabase/server";
import type {
  InputType,
  IssueWithType,
  PreflightSession,
  StatusColor,
} from "@/lib/types/database";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

const ACTIVE_THRESHOLD_DAYS = 7;
const RECENT_LIMIT = 5;
const ISSUES_LIMIT = 5;

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) notFound();
  const aircraftId = parsed.data;

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const [aircraftRes, issueCountRes, activeIssuesRes, sessionTimesRes, recentSessionsRes] =
    await Promise.all([
      supabase
        .from("aircraft")
        .select("id, tail_number, aircraft_type")
        .eq("id", aircraftId)
        .maybeSingle(),
      supabase
        .from("issues")
        .select("*", { count: "exact", head: true })
        .eq("aircraft_id", aircraftId)
        .eq("current_status", "active"),
      supabase
        .from("issues")
        .select("*, issue_type:issue_types(*)")
        .eq("aircraft_id", aircraftId)
        .eq("current_status", "active")
        .order("last_seen_at", { ascending: false })
        .limit(ISSUES_LIMIT),
      supabase
        .from("preflight_sessions")
        .select("created_at")
        .eq("aircraft_id", aircraftId),
      supabase
        .from("preflight_sessions")
        .select("id, input_type, status_color, created_at")
        .eq("aircraft_id", aircraftId)
        .order("created_at", { ascending: false })
        .limit(RECENT_LIMIT),
    ]);

  if (!aircraftRes.data) notFound();
  const aircraft = aircraftRes.data;

  const activeIssueCount = issueCountRes.count ?? 0;
  const statusColor: StatusColor = computeStatusColor(activeIssueCount);

  const activeIssues = (activeIssuesRes.data ?? []) as IssueWithType[];
  const sessionTimes = (sessionTimesRes.data ?? []).map((s) =>
    new Date(s.created_at).getTime(),
  );
  const recentSessions = (recentSessionsRes.data ?? []) as Pick<
    PreflightSession,
    "id" | "input_type" | "status_color" | "created_at"
  >[];

  const headerLabel = aircraft.aircraft_type
    ? `${aircraft.tail_number} · ${aircraft.aircraft_type}`
    : aircraft.tail_number;

  const lastSessionAt = recentSessions[0]?.created_at ?? null;
  const activityCopy = activityIndicatorCopy(lastSessionAt);

  return (
    <div className="flex flex-col gap-8">
      {/* Section A: Status header */}
      <header className="flex flex-col items-start gap-3">
        <StatusChip color={statusColor} label={headerLabel} size="lg" />
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{activityCopy}</p>
        </div>
      </header>

      {/* Section B: Start Preflight CTA */}
      <Button
        asChild
        size="lg"
        className="h-14 rounded-2xl text-base shadow-sm self-stretch sm:self-start sm:px-10"
      >
        <Link href={`/aircraft/${aircraftId}/preflight`}>
          <Plane className="size-4 -rotate-45" />
          Start Preflight
        </Link>
      </Button>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Section C: Active issues */}
        <ActiveIssuesCard
          aircraftId={aircraftId}
          issues={activeIssues}
          totalCount={activeIssueCount}
          sessionTimes={sessionTimes}
        />

        {/* Section D: Recent sessions */}
        <RecentSessionsCard
          aircraftId={aircraftId}
          sessions={recentSessions}
        />
      </div>
    </div>
  );
}

// ===========================================================================
// Section C: Active issues
// ===========================================================================

function ActiveIssuesCard({
  aircraftId,
  issues,
  totalCount,
  sessionTimes,
}: {
  aircraftId: string;
  issues: IssueWithType[];
  totalCount: number;
  sessionTimes: number[];
}) {
  const overflow = totalCount - issues.length;
  return (
    <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Active issues
        </h2>
        <span className="text-xs text-muted-foreground">
          {totalCount} total
        </span>
      </div>

      {totalCount === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200/70 bg-emerald-50/40 px-4 py-3">
          <span className="flex size-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckCircle2 className="size-4" />
          </span>
          <div className="text-sm font-medium text-emerald-800">
            All clear — no active issues
          </div>
        </div>
      ) : (
        <ul className="space-y-2">
          {issues.map((issue) => {
            const lastSeenMs = new Date(issue.last_seen_at).getTime();
            const sessionsSince = sessionTimes.filter(
              (t) => t > lastSeenMs,
            ).length;
            const flightsSince = Math.max(1, sessionsSince + 1);
            return (
              <li
                key={issue.id}
                className="flex items-center justify-between rounded-xl border border-border/60 bg-background px-3 py-2.5"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="size-2 rounded-full bg-amber-500 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {issue.issue_type.name}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Seen {flightsSince}{" "}
                      {flightsSince === 1 ? "flight" : "flights"} ago
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {overflow > 0 && (
        <div className="mt-3 text-right">
          <Link
            href={`/aircraft/${aircraftId}/memory?tab=issues`}
            className="text-xs text-sky-700 hover:underline"
          >
            View all {totalCount} issues →
          </Link>
        </div>
      )}
    </section>
  );
}

// ===========================================================================
// Section D: Recent sessions
// ===========================================================================

function RecentSessionsCard({
  aircraftId,
  sessions,
}: {
  aircraftId: string;
  sessions: Pick<
    PreflightSession,
    "id" | "input_type" | "status_color" | "created_at"
  >[];
}) {
  return (
    <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Recent sessions
        </h2>
        {sessions.length > 0 && (
          <Link
            href={`/aircraft/${aircraftId}/sessions`}
            className="text-xs text-sky-700 hover:underline"
          >
            View all
          </Link>
        )}
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/70 bg-background px-4 py-6 text-center">
          <div className="text-sm font-medium">Log your first preflight</div>
          <div className="text-xs text-muted-foreground mt-1">
            Tap Start Preflight above to begin.
          </div>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {sessions.map((s) => (
            <li key={s.id}>
              <Link
                href={`/aircraft/${aircraftId}/sessions`}
                className="group flex items-center gap-3 rounded-xl border border-border/60 bg-background px-3 py-2.5 transition-colors hover:border-sky-200 hover:bg-sky-50/30"
              >
                <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground shrink-0">
                  <InputTypeIcon type={s.input_type} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">
                    {inputTypeLabel(s.input_type)}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {formatRelative(s.created_at)}
                  </div>
                </div>
                <StatusDot color={s.status_color} />
                <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function InputTypeIcon({ type }: { type: InputType }) {
  if (type === "voice") return <Mic className="size-4" />;
  if (type === "photo") return <Camera className="size-4" />;
  return <CheckCircle2 className="size-4" />;
}

function inputTypeLabel(type: InputType): string {
  if (type === "voice") return "Voice note";
  if (type === "photo") return "Photo";
  return "No issues";
}

function StatusDot({ color }: { color: StatusColor | null }) {
  const cls =
    color === "green"
      ? "bg-emerald-500"
      : color === "yellow"
        ? "bg-amber-500"
        : color === "red"
          ? "bg-rose-500"
          : "bg-sky-300";
  return <span className={`size-2 rounded-full ${cls} shrink-0`} aria-hidden />;
}

// ===========================================================================
// Activity copy + relative time
// ===========================================================================

function activityIndicatorCopy(lastSessionIso: string | null): string {
  if (!lastSessionIso) return "Log your first preflight to get started.";
  const last = new Date(lastSessionIso).getTime();
  const ageMs = Date.now() - last;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays <= ACTIVE_THRESHOLD_DAYS) {
    return `Last preflight ${formatRelative(lastSessionIso)} — you're covered.`;
  }
  return `It's been ${formatRelative(lastSessionIso)} — time for a check?`;
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} ${hr === 1 ? "hour" : "hours"} ago`;
  const d = Math.round(hr / 24);
  if (d < 30) return `${d} ${d === 1 ? "day" : "days"} ago`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo} ${mo === 1 ? "month" : "months"} ago`;
  const yr = Math.round(mo / 12);
  return `${yr} ${yr === 1 ? "year" : "years"} ago`;
}
