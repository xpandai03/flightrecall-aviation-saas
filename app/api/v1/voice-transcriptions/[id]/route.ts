import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

// Whisper transcripts for preflight clips run ~50–500 chars in real
// use. 2000 is a generous 4x ceiling that prevents the "paste an
// entire essay" abuse case without constraining real edits.
const bodySchema = z.object({
  transcript_text: z.string().max(2000),
});

/**
 * Update transcript_text on an existing voice_transcriptions row.
 *
 * IMPORTANT: this endpoint does NOT re-run keyword extraction. Per the
 * M2 plan §6 Q4 + Phase 3 Batch 1 spec, re-extraction on transcript
 * edit is an explicit V1 limitation. Existing issues from the original
 * transcript stay; new edits do not produce new issue rows. Do not
 * "improve" this by triggering lib/issue-extraction.ts here — that is
 * deliberately out of scope and would change the contract observed by
 * the dashboard's Active Issues card.
 *
 * RLS: voice_tx_update_own (m4_lockdown_and_enable_rls.sql:164) scopes
 * the update to transcripts whose preflight_session belongs to one of
 * the authenticated user's aircraft. A successful update on a row the
 * user doesn't own returns zero rows (PGRST116) which we surface as
 * 404 — same response shape as a missing id, since exposing the
 * difference would leak existence to unauthorized callers.
 *
 * Empty string (transcript_text: "") is permitted and persists. The UI
 * renders an "(empty)" placeholder for that case.
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const bodyParsed = bodySchema.safeParse(body);
  if (!bodyParsed.success) {
    return NextResponse.json(
      { error: "Invalid body: transcript_text must be a string ≤2000 chars" },
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

  // No re-extraction on edit. Just write the text.
  const { data: updated, error: updateErr } = await supabase
    .from("voice_transcriptions")
    .update({ transcript_text: bodyParsed.data.transcript_text })
    .eq("id", idParsed.data)
    .select()
    .maybeSingle();

  if (updateErr) {
    // Log the transcription id only — never the transcript text (HIPAA-adjacent).
    console.error("voice-transcriptions PATCH failed", {
      transcription_id: idParsed.data,
      error: updateErr.message,
    });
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  if (!updated) {
    // RLS-blocked OR truly missing — same response either way to avoid
    // leaking existence.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(updated, { status: 200 });
}
