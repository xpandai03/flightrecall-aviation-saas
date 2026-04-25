import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { transcribeAudio } from "@/lib/whisper";

const BUCKET = "flight-recall-media";

type StartArgs = {
  supabase: SupabaseClient;
  media_asset_id: string;
  preflight_session_id: string;
  storage_key: string;
  file_name: string | null;
};

type StartResult =
  | { ok: true; voice_transcription_id: string; alreadyExists: boolean }
  | { ok: false; status: number; error: string };

/**
 * Insert (or fetch existing) voice_transcriptions row for an audio media asset.
 * Caller is responsible for scheduling `runTranscription` via Next 16 `after()`
 * once this returns ok and `alreadyExists === false`.
 */
export async function startTranscription(
  args: StartArgs,
): Promise<StartResult> {
  const { supabase, media_asset_id, preflight_session_id } = args;

  const existing = await supabase
    .from("voice_transcriptions")
    .select("id")
    .eq("media_asset_id", media_asset_id)
    .maybeSingle();

  if (existing.error) {
    return { ok: false, status: 500, error: existing.error.message };
  }
  if (existing.data) {
    return {
      ok: true,
      voice_transcription_id: existing.data.id,
      alreadyExists: true,
    };
  }

  const { data, error } = await supabase
    .from("voice_transcriptions")
    .insert({
      media_asset_id,
      preflight_session_id,
      transcription_status: "pending",
    })
    .select("id")
    .single();

  if (error || !data) {
    return {
      ok: false,
      status: 500,
      error: error?.message ?? "Failed to insert transcription row",
    };
  }
  return { ok: true, voice_transcription_id: data.id, alreadyExists: false };
}

type RunArgs = {
  supabase: SupabaseClient;
  voice_transcription_id: string;
  preflight_session_id: string;
  storage_key: string;
  file_name: string | null;
};

/**
 * Long-running half. Downloads the audio via a server-minted signed URL,
 * sends it to Whisper, writes the result back. Designed to be invoked
 * inside `after()` so the originating request has already returned.
 *
 * Never throws. All failure paths land as voice_transcriptions.status='failed'.
 */
export async function runTranscription(args: RunArgs): Promise<void> {
  const {
    supabase,
    voice_transcription_id,
    preflight_session_id,
    storage_key,
    file_name,
  } = args;

  await supabase
    .from("voice_transcriptions")
    .update({
      transcription_status: "processing",
      started_at: new Date().toISOString(),
    })
    .eq("id", voice_transcription_id);

  try {
    const { data: signed, error: signedErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storage_key, 60);
    if (signedErr || !signed?.signedUrl) {
      throw new Error(
        `signed download URL failed: ${signedErr?.message ?? "unknown"}`,
      );
    }
    const audioRes = await fetch(signed.signedUrl);
    if (!audioRes.ok) {
      throw new Error(`audio download failed: ${audioRes.status}`);
    }
    const buf = Buffer.from(await audioRes.arrayBuffer());
    const safeName = file_name && file_name.length > 0 ? file_name : "voice-note.webm";

    const result = await transcribeAudio(buf, safeName);

    await supabase
      .from("voice_transcriptions")
      .update({
        transcription_status: "completed",
        transcript_text: result.text,
        language: result.language,
        duration_seconds: result.duration_seconds,
        model: result.model,
        completed_at: new Date().toISOString(),
      })
      .eq("id", voice_transcription_id);

    await supabase
      .from("preflight_sessions")
      .update({ transcript_text: result.text })
      .eq("id", preflight_session_id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("voice_transcriptions")
      .update({
        transcription_status: "failed",
        error_message: message.slice(0, 500),
        completed_at: new Date().toISOString(),
      })
      .eq("id", voice_transcription_id);
  }
}
