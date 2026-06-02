import { NextResponse, after } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient, createServiceRoleClient } from "@/utils/supabase/server";
import { runTranscription, startTranscription } from "@/lib/transcription-job";

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

  // M4 Item 5: manual quick-tag bucketing removed. The standard flow no
  // longer sends a quick_tag, so there is no synchronous issue creation
  // here — issues come from voice keyword extraction (Item 2/3). The
  // quick_tag column + the job's photo+voice fallback (Item 3) are kept;
  // they simply never fire while nothing sets a tag. A photo with no voice
  // therefore creates no issue (signed-off behavior).

  let voice_transcription_id: string | undefined;
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
      // M4 Item 3: photo-attached voice now RUNS extraction (was skipped).
      // photoIdToLink is passed to the job so it binds the photo to the
      // first extracted issue, or falls back to the photo's quick_tag.
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
          // When set, the job binds this photo to the first extracted
          // issue (voice wins) or applies the photo's quick_tag fallback.
          photoAttachmentMediaId: photoIdToLink ?? undefined,
        });
      });
    }
  }

  // `issue_id` is already on `updated` (a media_assets column); no
  // synchronous issue creation to merge in anymore.
  const responsePayload: Record<string, unknown> = { ...updated };
  if (voice_transcription_id) {
    responsePayload.voice_transcription_id = voice_transcription_id;
  }

  return NextResponse.json(responsePayload, { status: 200 });
}
