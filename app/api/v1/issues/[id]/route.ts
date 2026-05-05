import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

// PATCH body — at least one of issue_type_id or location must be set.
// location accepts string, null (clear), or omitted (no change).
const patchBodySchema = z
  .object({
    issue_type_id: z.string().uuid().optional(),
    location: z.union([z.string().min(1).max(100), z.null()]).optional(),
  })
  .refine((b) => b.issue_type_id !== undefined || b.location !== undefined, {
    message: "At least one of issue_type_id or location must be provided",
  });

/**
 * Edit an auto-extracted issue's type and/or location.
 *
 * IMPORTANT: this endpoint does NOT trigger keyword extraction. Per the
 * M2 plan, re-extraction on edit is an explicit V1 limitation. Edits
 * adjust the materialized issues row only — they do not re-scan the
 * source transcript or update issue_observations.raw_transcript /
 * summary. Do not "improve" this by calling lib/issue-extraction.ts
 * here; that would change the contract and break the per-row Confirm-
 * screen UX (a fresh extraction could insert OR remove rows the user
 * is currently looking at).
 *
 * RLS: issues_update_own (m4_lockdown_and_enable_rls.sql:204) scopes
 * the update to issues whose aircraft belongs to the authenticated
 * user. RLS-blocked OR truly missing both surface as 404 to avoid
 * leaking existence.
 *
 * Postgres unique constraint (aircraft_id, issue_type_id, location)
 * means an edit that lands on an already-occupied (type, location)
 * for this aircraft fails with 23505 — surfaced as 409.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const idParsed = idSchema.safeParse(id);
  if (!idParsed.success) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const bodyParsed = patchBodySchema.safeParse(raw);
  if (!bodyParsed.success) {
    return NextResponse.json(
      { error: "Invalid body" },
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

  // No re-extraction. Just write the patch.
  const { data: updated, error: updateErr } = await supabase
    .from("issues")
    .update(bodyParsed.data)
    .eq("id", idParsed.data)
    .select("*, issue_type:issue_types(*)")
    .maybeSingle();

  if (updateErr) {
    // Postgres unique_violation (23505) → 409. The unique constraint
    // is (aircraft_id, issue_type_id, location). Don't echo the
    // attempted location text in logs (HIPAA-adjacent).
    if (updateErr.code === "23505") {
      return NextResponse.json(
        {
          error:
            "This issue type already exists at that location for this aircraft. Edit the existing one instead, or pick a different location.",
        },
        { status: 409 },
      );
    }
    console.error("issues PATCH failed", {
      issue_id: idParsed.data,
      code: updateErr.code,
    });
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(updated, { status: 200 });
}
