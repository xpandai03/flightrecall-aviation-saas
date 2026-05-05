import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

// Window during which an unfinalized session is considered "still in
// progress" and resumable. Anything older starts a fresh session.
const RESUME_THRESHOLD_HOURS = 1;

const querySchema = z.object({
  aircraftId: z.string().uuid(),
});

/**
 * Look up the most recent unfinalized preflight session for an aircraft.
 * Returns 200 with `{ session: PreflightSessionWithMedia | null }` so
 * the client doesn't have to distinguish 404 from "no in-progress".
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    aircraftId: url.searchParams.get("aircraftId") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(
    Date.now() - RESUME_THRESHOLD_HOURS * 60 * 60 * 1000,
  ).toISOString();

  const { data, error } = await supabase
    .from("preflight_sessions")
    .select(
      "*, media_assets(*), voice_transcriptions(*), issue_observations(*, issue:issues(*, issue_type:issue_types(*)))",
    )
    .eq("aircraft_id", parsed.data.aircraftId)
    .is("finalized_at", null)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ session: data ?? null }, { status: 200 });
}
