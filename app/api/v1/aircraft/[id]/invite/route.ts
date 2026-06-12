import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { generateInviteCode, isInviteRedeemable } from "@/lib/invite-code";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

/** True iff the authed user is the OWNER member of this aircraft. */
async function isOwner(
  supabase: ReturnType<typeof createClient>,
  aircraftId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("aircraft_members")
    .select("role")
    .eq("aircraft_id", aircraftId)
    .eq("user_id", userId)
    .eq("role", "owner")
    .maybeSingle();
  return Boolean(data);
}

// GET — owner reads the aircraft's current ACTIVE invite code (or null).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
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
  if (!(await isOwner(supabase, id, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Owner-only RLS returns only this owner's invites; pick the active one.
  const { data: rows, error } = await supabase
    .from("aircraft_invites")
    .select("code, revoked_at, expires_at")
    .eq("aircraft_id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const now = Date.now();
  const active = (rows ?? []).find((r) => isInviteRedeemable(r, now));
  return NextResponse.json({ code: active?.code ?? null });
}

// POST — owner generates/regenerates a code: revoke any active invite,
// then mint a fresh high-entropy one. Returns the new code.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
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
  if (!(await isOwner(supabase, id, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Revoke any currently-active invite (keeps the one-active-per-aircraft
  // index satisfied before inserting the new one).
  const { error: revokeErr } = await supabase
    .from("aircraft_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("aircraft_id", id)
    .is("revoked_at", null);
  if (revokeErr) {
    return NextResponse.json({ error: revokeErr.message }, { status: 500 });
  }

  const code = generateInviteCode();
  const { data: created, error: insErr } = await supabase
    .from("aircraft_invites")
    .insert({ aircraft_id: id, code, created_by: user.id })
    .select("code")
    .single();
  if (insErr || !created) {
    return NextResponse.json(
      { error: insErr?.message ?? "Failed to create invite" },
      { status: 500 },
    );
  }

  return NextResponse.json({ code: created.code }, { status: 201 });
}

// DELETE — owner revokes the active invite (no active code afterward).
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
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
  if (!(await isOwner(supabase, id, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase
    .from("aircraft_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("aircraft_id", id)
    .is("revoked_at", null);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
