import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { isJoinByTailWellFormed } from "@/lib/open-join";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  tail: z.string().min(1).max(20),
  aircraft_type: z.string().min(1).max(80),
});

// Uniform rejection — the same message whether the tail/type don't match or
// were malformed (tails are public, but there's no reason to confirm
// existence on a near-miss).
const NO_MATCH = { error: "No matching aircraft found." };

// POST — open join by tail + aircraft type (alongside the invite-code path
// at /api/v1/aircraft/join, which is unchanged). Validation + the membership
// insert happen in the SECURITY DEFINER function join_aircraft_by_tail(),
// which forces user_id = auth.uid() and derives aircraft_id from the
// tail+type match, so it can only ever add the caller to the matched
// aircraft.
export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(NO_MATCH, { status: 400 });
  }
  const tail = parsed.data.tail;
  const aircraftType = parsed.data.aircraft_type;
  // Cheap shape gate before the DB round-trip (both fields required).
  if (!isJoinByTailWellFormed(tail, aircraftType)) {
    return NextResponse.json(NO_MATCH, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Returns the joined aircraft_id, or null when no aircraft matches.
  const { data: aircraftId, error } = await supabase.rpc(
    "join_aircraft_by_tail",
    { p_tail: tail, p_type: aircraftType },
  );
  if (error) {
    console.error("[aircraft join-by-tail] rpc failed", {
      user_id: user.id,
      error_code: error.code,
      error_message: error.message,
    });
    return NextResponse.json(NO_MATCH, { status: 400 });
  }
  if (!aircraftId) {
    return NextResponse.json(NO_MATCH, { status: 404 });
  }

  // Membership now exists → Phase 1 RLS makes ONLY this aircraft visible.
  const { data: aircraft, error: fetchErr } = await supabase
    .from("aircraft")
    .select("*")
    .eq("id", aircraftId as string)
    .maybeSingle();
  if (fetchErr || !aircraft) {
    return NextResponse.json({ id: aircraftId }, { status: 200 });
  }
  return NextResponse.json(aircraft, { status: 200 });
}
