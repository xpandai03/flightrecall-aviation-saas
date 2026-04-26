import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();
const MAX_ACTIVE = 5;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const [issuesRes, sessionsRes] = await Promise.all([
    supabase
      .from("issues")
      .select("*, issue_type:issue_types(*)")
      .eq("aircraft_id", parsed.data)
      .eq("current_status", "active")
      .order("last_seen_at", { ascending: false })
      .limit(MAX_ACTIVE),
    supabase
      .from("preflight_sessions")
      .select("created_at")
      .eq("aircraft_id", parsed.data)
      .order("created_at", { ascending: true }),
  ]);

  if (issuesRes.error) {
    return NextResponse.json(
      { error: issuesRes.error.message },
      { status: 500 },
    );
  }
  if (sessionsRes.error) {
    return NextResponse.json(
      { error: sessionsRes.error.message },
      { status: 500 },
    );
  }

  const sessionTimes = (sessionsRes.data ?? []).map((s) =>
    new Date(s.created_at).getTime(),
  );

  const enriched = (issuesRes.data ?? []).map((issue) => {
    const lastSeenMs = new Date(issue.last_seen_at).getTime();
    const sessionsSince = sessionTimes.filter((t) => t > lastSeenMs).length;
    const flights_since = Math.max(1, sessionsSince + 1);
    return { ...issue, flights_since };
  });

  return NextResponse.json(enriched);
}
