import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { computeStatusColor } from "@/lib/status-color";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

/**
 * Finalize an in-progress preflight session.
 *
 * Idempotent: calling on an already-finalized session returns 200 with
 * the existing row (no second timestamp write, no error). Recomputes
 * status_color at finalize time so multi-input sessions that created
 * issues mid-flow reflect the live active-issue count.
 */
export async function POST(
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

  const { data: existing, error: loadErr } = await supabase
    .from("preflight_sessions")
    .select("*")
    .eq("id", idParsed.data)
    .maybeSingle();
  if (loadErr) {
    return NextResponse.json({ error: loadErr.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (existing.finalized_at) {
    return NextResponse.json({ session: existing }, { status: 200 });
  }

  const { count, error: countErr } = await supabase
    .from("issues")
    .select("*", { count: "exact", head: true })
    .eq("aircraft_id", existing.aircraft_id)
    .eq("current_status", "active");

  // Status-color recompute is best-effort — a count failure shouldn't
  // block finalization. If counting fails we leave the existing snapshot.
  let nextStatusColor = existing.status_color;
  if (countErr) {
    console.error("finalize: status_color recompute failed", countErr.message);
  } else if (existing.input_type !== "no_issues") {
    // no_issues sessions stay locked to 'green' regardless of count
    // (declarative, per the M3 contract).
    nextStatusColor = computeStatusColor(count ?? 0);
  }

  const { data: updated, error: updateErr } = await supabase
    .from("preflight_sessions")
    .update({
      finalized_at: new Date().toISOString(),
      status_color: nextStatusColor,
    })
    .eq("id", idParsed.data)
    .select()
    .single();
  if (updateErr || !updated) {
    return NextResponse.json(
      { error: updateErr?.message ?? "Failed to finalize session" },
      { status: 500 },
    );
  }

  return NextResponse.json({ session: updated }, { status: 200 });
}
