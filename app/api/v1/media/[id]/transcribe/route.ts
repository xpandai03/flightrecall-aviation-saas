import { NextResponse, after } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { runTranscription, startTranscription } from "@/lib/transcription-job";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

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

  const { data: media, error: loadErr } = await supabase
    .from("media_assets")
    .select("*")
    .eq("id", idParsed.data)
    .maybeSingle();
  if (loadErr) {
    return NextResponse.json({ error: loadErr.message }, { status: 500 });
  }
  if (!media) {
    return NextResponse.json({ error: "media not found" }, { status: 404 });
  }
  if (media.media_type !== "audio") {
    return NextResponse.json(
      { error: "media is not audio" },
      { status: 400 },
    );
  }
  if (media.upload_status !== "uploaded") {
    return NextResponse.json(
      { error: "media has not finished uploading" },
      { status: 400 },
    );
  }

  const start = await startTranscription({
    supabase,
    media_asset_id: media.id,
    preflight_session_id: media.preflight_session_id,
    storage_key: media.storage_key,
    file_name: media.file_name,
  });
  if (!start.ok) {
    return NextResponse.json({ error: start.error }, { status: start.status });
  }

  if (start.alreadyExists) {
    return NextResponse.json(
      {
        status: "exists",
        voice_transcription_id: start.voice_transcription_id,
      },
      { status: 200 },
    );
  }

  after(async () => {
    await runTranscription({
      supabase,
      voice_transcription_id: start.voice_transcription_id,
      preflight_session_id: media.preflight_session_id,
      storage_key: media.storage_key,
      file_name: media.file_name,
    });
  });

  return NextResponse.json(
    {
      status: "accepted",
      voice_transcription_id: start.voice_transcription_id,
    },
    { status: 202 },
  );
}
