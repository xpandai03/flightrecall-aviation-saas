import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { z } from "zod";

import {
  ActiveIssuesStack,
  SessionRowItem,
  StatusCard,
} from "@/components/dashboard";
import { summarizeSession } from "@/lib/api/adapter";
import { loadActiveIssuesBySeverity } from "@/lib/active-issues-load";
import { createClient } from "@/utils/supabase/server";
import type {
  IssueObservationDetail,
  MediaAsset,
  PreflightSession,
  StatusColor,
  VoiceTranscription,
} from "@/lib/types/database";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

const RECENT_LIMIT = 5;
const DASHBOARD_CRITICAL_CAP = 3;

type RecentSessionRow = Pick<
  PreflightSession,
  "id" | "input_type" | "status_color" | "created_at" | "transcript_text" | "notes_text"
> & {
  media_assets: Pick<MediaAsset, "id" | "media_type" | "quick_tag">[];
  voice_transcriptions: Pick<VoiceTranscription, "id" | "transcript_text">[];
  issue_observations: IssueObservationDetail[];
};

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

  const [userRes, aircraftRes, buckets, sessionTimesRes, recentSessionsRes] =
    await Promise.all([
      supabase.auth.getUser(),
      supabase
        .from("aircraft")
        .select("id, tail_number, aircraft_type")
        .eq("id", aircraftId)
        .maybeSingle(),
      loadActiveIssuesBySeverity(supabase, aircraftId),
      supabase
        .from("preflight_sessions")
        .select("created_at")
        .eq("aircraft_id", aircraftId)
        .order("created_at", { ascending: true }),
      supabase
        .from("preflight_sessions")
        .select(
          "id, input_type, status_color, created_at, transcript_text, notes_text, " +
            "media_assets(id, media_type, quick_tag), " +
            "voice_transcriptions(id, transcript_text), " +
            "issue_observations(*, issue:issues(*, issue_type:issue_types(*)))",
        )
        .eq("aircraft_id", aircraftId)
        .order("created_at", { ascending: false })
        .limit(RECENT_LIMIT),
    ]);

  const firstName = resolveFirstName(userRes.data.user);

  if (!aircraftRes.data) notFound();
  const aircraft = aircraftRes.data;

  const criticalIssues = buckets.critical;
  const criticalIssueCount = criticalIssues.length;

  const sessionTimes = (sessionTimesRes.data ?? []).map((s) =>
    new Date(s.created_at).getTime(),
  );

  const recentSessions =
    (recentSessionsRes.data ?? []) as unknown as RecentSessionRow[];

  const lastSessionAt = recentSessions[0]?.created_at ?? null;
  const totalSessionCount = sessionTimes.length;
  const minCriticalFlightsSince =
    criticalIssueCount > 0
      ? Math.min(...criticalIssues.map((i) => i.flights_since))
      : null;

  const mode: "has_issues" | "all_clear" | "first_session" =
    totalSessionCount === 0
      ? "first_session"
      : criticalIssueCount === 0
        ? "all_clear"
        : "has_issues";

  const subline =
    mode === "has_issues" && minCriticalFlightsSince !== null
      ? minCriticalFlightsSince <= 1
        ? "Last seen on your most recent flight"
        : `Last seen ${minCriticalFlightsSince} flights ago`
      : mode === "all_clear" && lastSessionAt
        ? `Last preflight ${formatRelative(lastSessionAt)}`
        : undefined;

  const dashboardTopCritical = criticalIssues.slice(0, DASHBOARD_CRITICAL_CAP);

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      {firstName && (
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-text-secondary">
          Hi,{" "}
          <span className="text-text-primary">{firstName}</span>
        </h1>
      )}
      <StatusCard
        tailNumber={aircraft.tail_number}
        aircraftModel={aircraft.aircraft_type}
        activeIssueCount={mode === "first_session" ? null : criticalIssueCount}
        subline={subline}
        mode={mode}
        ctaHref={`/aircraft/${aircraftId}/preflight`}
      />

      <section aria-labelledby="active-issues-heading">
        <h2
          id="active-issues-heading"
          className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-3"
        >
          Active Issues
        </h2>
        {criticalIssueCount === 0 ? (
          <ActiveIssuesCriticalEmpty />
        ) : (
          <ActiveIssuesStack
            aircraftId={aircraftId}
            issues={dashboardTopCritical}
          />
        )}
      </section>

      <section aria-labelledby="recent-sessions-heading">
        <h2
          id="recent-sessions-heading"
          className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-3"
        >
          Recent Sessions
        </h2>
        {recentSessions.length === 0 ? (
          <RecentSessionsEmpty />
        ) : (
          <ul className="flex flex-col gap-2">
            {recentSessions.map((s) => (
              <li key={s.id}>
                <SessionRowItem
                  summary={summarizeSession(s)}
                  mediaType={mediaTypeFromSession(s)}
                  timeAgo={formatRelative(s.created_at)}
                  status={statusFromColor(s.status_color)}
                  href={`/aircraft/${aircraftId}/sessions`}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ===========================================================================
// Empty states
// ===========================================================================

function ActiveIssuesCriticalEmpty() {
  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-card-glass/60 px-5 py-4 shadow-card-glow">
      <p className="text-sm text-text-muted">No critical issues</p>
      <p className="text-xs text-text-muted/80 mt-1">
        Cosmetic items are reviewed during preflight only.
      </p>
    </div>
  );
}

function RecentSessionsEmpty() {
  return (
    <div className="rounded-2xl bg-bg-card-glass border border-border-subtle p-5 shadow-card-glow text-center">
      <p className="text-sm text-text-secondary">No flights logged yet.</p>
      <p className="text-xs text-text-muted mt-1">
        Tap Start Preflight above to begin building memory.
      </p>
    </div>
  );
}

// ===========================================================================
// Page-local helpers
// ===========================================================================

function mediaTypeFromSession(
  s: Pick<PreflightSession, "input_type"> & {
    media_assets?: Pick<MediaAsset, "media_type">[];
  },
): "voice" | "photo" | "mixed" | "none" {
  if (s.input_type === "voice") return "voice";
  if (s.input_type === "photo") return "photo";
  return "none";
}

function statusFromColor(
  color: StatusColor | null,
): "critical" | "warning" | "all_clear" {
  if (color === "red") return "critical";
  if (color === "yellow") return "warning";
  return "all_clear";
}

type AuthUserShape = {
  email?: string | null;
  user_metadata?: { first_name?: unknown } | null;
} | null;

function resolveFirstName(user: AuthUserShape): string | null {
  const metaName = user?.user_metadata?.first_name;
  if (typeof metaName === "string" && metaName.trim().length > 0) {
    return metaName.trim();
  }
  const email = user?.email;
  if (email) {
    const local = email.split("@")[0]?.trim();
    if (local) return local.charAt(0).toUpperCase() + local.slice(1);
  }
  return null;
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
