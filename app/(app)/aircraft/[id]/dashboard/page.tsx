import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import {
  IssueCard,
  SessionRowItem,
  StatusCard,
} from "@/components/dashboard";
import {
  deriveIssueSeverity,
  formatIssueHistory,
} from "@/lib/issue-derivation";
import { summarizeSession } from "@/lib/api/adapter";
import { createClient } from "@/utils/supabase/server";
import type {
  ActiveIssue,
  IssueObservationDetail,
  MediaAsset,
  PreflightSession,
  StatusColor,
  VoiceTranscription,
} from "@/lib/types/database";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

const RECENT_LIMIT = 5;
const ISSUES_LIMIT = 5;

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

  const [
    userRes,
    aircraftRes,
    issueCountRes,
    activeIssuesRes,
    sessionTimesRes,
    recentSessionsRes,
  ] = await Promise.all([
    supabase.auth.getUser(),
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

  const activeIssueCount = issueCountRes.count ?? 0;

  const sessionTimes = (sessionTimesRes.data ?? []).map((s) =>
    new Date(s.created_at).getTime(),
  );

  const activeIssues: ActiveIssue[] = (activeIssuesRes.data ?? []).map((issue) => {
    const lastSeenMs = new Date(issue.last_seen_at).getTime();
    const sessionsSince = sessionTimes.filter((t) => t > lastSeenMs).length;
    const flights_since = Math.max(1, sessionsSince + 1);
    return { ...issue, flights_since } as ActiveIssue;
  });

  const recentSessions =
    (recentSessionsRes.data ?? []) as unknown as RecentSessionRow[];

  const lastSessionAt = recentSessions[0]?.created_at ?? null;
  const totalSessionCount = sessionTimes.length;
  const mostRecentActiveFlights = activeIssues[0]?.flights_since ?? null;

  const mode: "has_issues" | "all_clear" | "first_session" =
    totalSessionCount === 0
      ? "first_session"
      : activeIssueCount === 0
        ? "all_clear"
        : "has_issues";

  const subline =
    mode === "has_issues" && mostRecentActiveFlights !== null
      ? mostRecentActiveFlights <= 1
        ? "Last seen on your most recent flight"
        : `Last seen ${mostRecentActiveFlights} flights ago`
      : mode === "all_clear" && lastSessionAt
        ? `Last preflight ${formatRelative(lastSessionAt)}`
        : undefined;

  const overflow = activeIssueCount - activeIssues.length;

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      {firstName && (
        <p className="text-text-secondary text-sm sm:text-base">
          Hi,{" "}
          <span className="text-text-primary font-medium">{firstName}</span>
        </p>
      )}
      <StatusCard
        tailNumber={aircraft.tail_number}
        aircraftModel={aircraft.aircraft_type}
        activeIssueCount={mode === "first_session" ? null : activeIssueCount}
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
        {activeIssueCount === 0 ? (
          <ActiveIssuesEmpty />
        ) : (
          <ul className="flex flex-col gap-2">
            {activeIssues.map((issue) => (
              <li key={issue.id}>
                <IssueCard
                  title={issue.issue_type?.name ?? "Unknown issue"}
                  description={issue.description}
                  severity={deriveIssueSeverity(issue)}
                  history={formatIssueHistory({
                    flights_since: issue.flights_since,
                  })}
                />
              </li>
            ))}
          </ul>
        )}
        {overflow > 0 && (
          <div className="mt-3 text-right">
            <Link
              href={`/aircraft/${aircraftId}/memory?tab=issues`}
              className="text-accent-mint text-xs hover:underline"
            >
              View all {activeIssueCount} issues →
            </Link>
          </div>
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

function ActiveIssuesEmpty() {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-bg-card-glass border border-border-subtle p-5 shadow-card-glow">
      <span className="flex size-8 items-center justify-center rounded-full bg-status-clear/15 text-status-clear">
        <CheckIcon />
      </span>
      <div className="text-sm text-text-secondary">No active issues</div>
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

// Tiny inline check (avoids dragging in lucide just for the empty state).
function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
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
  // Today input_type is single-valued. 'mixed' is reserved for future use
  // when a session can carry both photo and audio.
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

