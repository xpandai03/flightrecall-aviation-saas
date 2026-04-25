import { NextResponse, after } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { runTranscription, startTranscription } from "@/lib/transcription-job";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

const completeSchema = z.object({
  file_size_bytes: z.number().int().nonnegative().optional(),
  quick_tag: z.enum(["scratch", "dent", "tire", "oil", "other"]).optional(),
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

  if (
    parsed.data.quick_tag !== undefined &&
    existing.media_type !== "photo"
  ) {
    return NextResponse.json(
      { error: "quick_tag is only valid for photo media" },
      { status: 400 },
    );
  }

  const update: Record<string, unknown> = { upload_status: "uploaded" };
  if (parsed.data.file_size_bytes !== undefined) {
    update.file_size_bytes = parsed.data.file_size_bytes;
  }
  if (parsed.data.quick_tag !== undefined) {
    update.quick_tag = parsed.data.quick_tag;
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

  let voice_transcription_id: string | undefined;
  if (updated.media_type === "audio") {
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
    if (!start.alreadyExists) {
      after(async () => {
        await runTranscription({
          supabase,
          voice_transcription_id: start.voice_transcription_id,
          preflight_session_id: updated.preflight_session_id,
          storage_key: updated.storage_key,
          file_name: updated.file_name,
        });
      });
    }
  }

  return NextResponse.json(
    voice_transcription_id
      ? { ...updated, voice_transcription_id }
      : updated,
    { status: 200 },
  );
}
