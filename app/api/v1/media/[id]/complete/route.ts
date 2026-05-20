import { NextResponse, after } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient, createServiceRoleClient } from "@/utils/supabase/server";
import { runTranscription, startTranscription } from "@/lib/transcription-job";
import { selectIssueForExtraction } from "@/lib/issue-resurrection";

async function upsertIssueForMedia(args: {
  supabase: SupabaseClient;
  media_asset_id: string;
  preflight_session_id: string;
  quick_tag: string;
}): Promise<{ ok: true; issue_id: string } | { ok: false; error: string }> {
  const { supabase, media_asset_id, preflight_session_id, quick_tag } = args;

  const { data: type, error: typeErr } = await supabase
    .from("issue_types")
    .select("id")
    .eq("slug", quick_tag)
    .maybeSingle();
  if (typeErr) return { ok: false, error: typeErr.message };
  if (!type) return { ok: false, error: `unknown issue_type slug: ${quick_tag}` };

  const { data: session, error: sesErr } = await supabase
    .from("preflight_sessions")
    .select("id, aircraft_id, created_at")
    .eq("id", preflight_session_id)
    .maybeSingle();
  if (sesErr) return { ok: false, error: sesErr.message };
  if (!session) return { ok: false, error: "session not found" };

  // Match every issue row for (aircraft, type) with a null location —
  // the legacy quick-tag path never sets location. No .maybeSingle():
  // a resolved row and an active row may now coexist for the same key.
  // selectIssueForExtraction reuses only an ACTIVE row, so a photo
  // quick-tag never re-activates a resolved issue — it inserts a fresh
  // one instead.
  const { data: candidates, error: lookupErr } = await supabase
    .from("issues")
    .select("id, current_status")
    .eq("aircraft_id", session.aircraft_id)
    .eq("issue_type_id", type.id)
    .is("location", null);
  if (lookupErr) return { ok: false, error: lookupErr.message };

  const decision = selectIssueForExtraction(candidates ?? []);

  let issue_id: string;
  if (decision.action === "update") {
    const { data: updated, error: uErr } = await supabase
      .from("issues")
      .update({
        last_seen_at: new Date().toISOString(),
        current_status: "active",
        resolved_at: null,
      })
      .eq("id", decision.id)
      .select("id")
      .single();
    if (uErr || !updated) {
      return { ok: false, error: uErr?.message ?? "issue update failed" };
    }
    issue_id = updated.id;
  } else {
    const nowIso = new Date().toISOString();
    const { data: created, error: cErr } = await supabase
      .from("issues")
      .insert({
        aircraft_id: session.aircraft_id,
        issue_type_id: type.id,
        first_seen_at: nowIso,
        last_seen_at: nowIso,
        current_status: "active",
      })
      .select("id")
      .single();
    if (cErr || !created) {
      return { ok: false, error: cErr?.message ?? "issue insert failed" };
    }
    issue_id = created.id;
  }

  const { error: linkErr } = await supabase
    .from("media_assets")
    .update({ issue_id })
    .eq("id", media_asset_id);
  if (linkErr) return { ok: false, error: linkErr.message };

  const { error: obsErr } = await supabase
    .from("issue_observations")
    .insert({
      issue_id,
      preflight_session_id,
      action: "logged",
    });
  if (obsErr) return { ok: false, error: obsErr.message };

  return { ok: true, issue_id };
}

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

const completeSchema = z.object({
  file_size_bytes: z.number().int().nonnegative().optional(),
  quick_tag: z.enum(["scratch", "dent", "tire", "oil", "other"]).optional(),
  note_text: z.string().max(500).optional(),
  photo_attachment_media_id: z.string().uuid().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const idParsed = idSchema.safeParse(id);
  if (!idParsed.success) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  let body: unknown = {};
  if (request.headers.get("content-length") !== "0") {
    try {
      body = await request.json();
    } catch {
      // empty body is fine
    }
  }
  const parsed = completeSchema.safeParse(body);
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

  const { data: existing, error: loadErr } = await supabase
    .from("media_assets")
    .select("*")
    .eq("id", idParsed.data)
    .maybeSingle();
  if (loadErr) {
    return NextResponse.json({ error: loadErr.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "media not found" }, { status: 404 });
  }

  if (parsed.data.photo_attachment_media_id !== undefined) {
    if (existing.media_type !== "audio") {
      return NextResponse.json(
        { error: "photo_attachment_media_id is only valid for audio media" },
        { status: 400 },
      );
    }
  }
  if (parsed.data.note_text !== undefined) {
    if (existing.media_type !== "photo") {
      return NextResponse.json(
        { error: "note_text is only valid for photo media" },
        { status: 400 },
      );
    }
  }

  if (parsed.data.quick_tag !== undefined) {
    const { data: parentSession, error: parentErr } = await supabase
      .from("preflight_sessions")
      .select("input_type")
      .eq("id", existing.preflight_session_id)
      .maybeSingle();
    if (parentErr) {
      return NextResponse.json({ error: parentErr.message }, { status: 500 });
    }
    if (parentSession?.input_type === "no_issues") {
      return NextResponse.json(
        { error: "quick_tag is not valid on no_issues sessions" },
        { status: 400 },
      );
    }
  }

  const update: Record<string, unknown> = { upload_status: "uploaded" };
  if (parsed.data.file_size_bytes !== undefined) {
    update.file_size_bytes = parsed.data.file_size_bytes;
  }
  if (parsed.data.quick_tag !== undefined) {
    update.quick_tag = parsed.data.quick_tag;
  }
  if (parsed.data.note_text !== undefined && existing.media_type === "photo") {
    const t = parsed.data.note_text.trim();
    update.note_text = t.length > 0 ? t : null;
    update.voice_transcription_id = null;
  }

  const { data: updated, error: updateErr } = await supabase
    .from("media_assets")
    .update(update)
    .eq("id", idParsed.data)
    .select()
    .single();
  if (updateErr || !updated) {
    return NextResponse.json(
      { error: updateErr?.message ?? "Failed to update media" },
      { status: 500 },
    );
  }

  let issue_id: string | null | undefined = updated.issue_id;
  let issue_error: string | undefined;
  const effectiveQuickTag = parsed.data.quick_tag ?? updated.quick_tag;
  if (
    (updated.media_type === "photo" || updated.media_type === "audio") &&
    effectiveQuickTag &&
    !updated.issue_id
  ) {
    const issueResult = await upsertIssueForMedia({
      supabase,
      media_asset_id: updated.id,
      preflight_session_id: updated.preflight_session_id,
      quick_tag: effectiveQuickTag,
    });
    if (issueResult.ok) {
      issue_id = issueResult.issue_id;
    } else {
      issue_error = issueResult.error;
      console.error("issue auto-create/update failed", issueResult.error);
    }
  }

  let voice_transcription_id: string | undefined;
  let skipKeywordExtraction = false;
  let photoIdToLink: string | null = null;

  if (updated.media_type === "audio") {
    if (parsed.data.photo_attachment_media_id) {
      const { data: photoRow, error: photoErr } = await supabase
        .from("media_assets")
        .select("id, media_type, preflight_session_id")
        .eq("id", parsed.data.photo_attachment_media_id)
        .maybeSingle();
      if (
        photoErr ||
        !photoRow ||
        photoRow.media_type !== "photo" ||
        photoRow.preflight_session_id !== updated.preflight_session_id
      ) {
        return NextResponse.json(
          { error: "Invalid photo_attachment_media_id" },
          { status: 400 },
        );
      }
      photoIdToLink = photoRow.id;
      skipKeywordExtraction = true;
    }

    const start = await startTranscription({
      supabase,
      media_asset_id: updated.id,
      preflight_session_id: updated.preflight_session_id,
      storage_key: updated.storage_key,
      file_name: updated.file_name,
    });
    if (!start.ok) {
      return NextResponse.json(
        { ...updated, transcription_error: start.error },
        { status: 200 },
      );
    }
    voice_transcription_id = start.voice_transcription_id;

    if (photoIdToLink && voice_transcription_id) {
      const { error: linkPhotoErr } = await supabase
        .from("media_assets")
        .update({
          voice_transcription_id,
          note_text: null,
        })
        .eq("id", photoIdToLink);
      if (linkPhotoErr) {
        console.error("photo voice_transcription_id link failed", {
          code: linkPhotoErr.code,
        });
        return NextResponse.json(
          { error: "Failed to link voice note to photo" },
          { status: 500 },
        );
      }
    }

    if (!start.alreadyExists) {
      const serviceClient = createServiceRoleClient();
      after(async () => {
        await runTranscription({
          supabase: serviceClient,
          voice_transcription_id: start.voice_transcription_id,
          preflight_session_id: updated.preflight_session_id,
          media_asset_id: updated.id,
          storage_key: updated.storage_key,
          file_name: updated.file_name,
          skipKeywordExtraction,
        });
      });
    }
  }

  const responsePayload: Record<string, unknown> = { ...updated };
  if (issue_id !== undefined) responsePayload.issue_id = issue_id;
  if (issue_error) responsePayload.issue_error = issue_error;
  if (voice_transcription_id) {
    responsePayload.voice_transcription_id = voice_transcription_id;
  }

  return NextResponse.json(responsePayload, { status: 200 });
}
