import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

/**
 * Returns the issues that were auto-logged on this preflight session,
 * via the issue_observations join. We filter on action='logged' so
 * carry-forward 'still'/'fixed'/'skipped' rows from the same session
 * are excluded — those are status mutations, not "issues this session
 * surfaced."
 *
 * Why join through issue_observations rather than filter issues by
 * created_at: the persistence path (lib/transcription-job.ts) UPDATEs
 * existing issues for already-known (aircraft, type, location) combos,
 * so a recurring issue's created_at points at the FIRST session it
 * was seen, not this one. The observations row is always inserted
 * fresh per session, making it the canonical "this-session" identity.
 *
 * RLS: issue_obs_select_own enforces session→aircraft→user scoping
 * for the observation rows; issues_select_own does the same for the
 * joined issues. No extra ownership check needed.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const idParsed = idSchema.safeParse(id);
  if (!idParsed.success) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("issue_observations")
    .select(
      "id, created_at, issue:issues(*, issue_type:issue_types(*))",
    )
    .eq("preflight_session_id", idParsed.data)
    .eq("action", "logged")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Defensive: a row with a missing joined issue would be malformed —
  // skip rather than 500 the whole list.
  const rows = (data ?? []).filter((r) => r.issue !== null);

  return NextResponse.json(
    rows.map((r) => ({
      observation_id: r.id,
      observation_created_at: r.created_at,
      issue: r.issue,
    })),
  );
}
