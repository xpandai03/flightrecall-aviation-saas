import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { isWellFormedInviteCode } from "@/lib/invite-code";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ code: z.string().min(1).max(128) });

// Uniform, non-enumerable rejection — never reveals whether a code exists.
const INVALID = { error: "Invalid or expired code." };

// POST — redeem an invite code to join its aircraft as a 'pilot' member.
// All validation + the membership insert happen in the SECURITY DEFINER
// function redeem_aircraft_invite(), which forces user_id = auth.uid() and
// aircraft_id = the code's aircraft. The tail number alone never joins.
export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(INVALID, { status: 400 });
  }
  const code = parsed.data.code.trim();
  // Cheap shape gate before the DB round-trip (still uniform on failure).
  if (!isWellFormedInviteCode(code)) {
    return NextResponse.json(INVALID, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Returns the joined aircraft_id, or null for unknown/revoked/expired.
  const { data: aircraftId, error } = await supabase.rpc(
    "redeem_aircraft_invite",
    { invite_code: code },
  );
  if (error) {
    // Don't leak DB internals; treat as a uniform failure.
    console.error("[aircraft join] redeem rpc failed", {
      user_id: user.id,
      error_code: error.code,
      error_message: error.message,
    });
    return NextResponse.json(INVALID, { status: 400 });
  }
  if (!aircraftId) {
    return NextResponse.json(INVALID, { status: 400 });
  }

  // Membership now exists → Phase 1 RLS makes the aircraft visible. Return
  // it so the client can route to its dashboard.
  const { data: aircraft, error: fetchErr } = await supabase
    .from("aircraft")
    .select("*")
    .eq("id", aircraftId as string)
    .maybeSingle();
  if (fetchErr || !aircraft) {
    // Joined, but couldn't read back — surface the id so the UI can route.
    return NextResponse.json({ id: aircraftId }, { status: 200 });
  }
  return NextResponse.json(aircraft, { status: 200 });
}
