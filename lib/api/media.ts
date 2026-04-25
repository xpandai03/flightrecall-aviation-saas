"use client";

import type { MediaAsset, QuickTag } from "@/lib/types/database";
import { requestUploadUrl } from "@/lib/api/sessions";

export type CompleteResponse = MediaAsset & {
  voice_transcription_id?: string;
  transcription_error?: string;
};

export async function completeMediaUpload(
  mediaAssetId: string,
  body: { file_size_bytes?: number; quick_tag?: QuickTag } = {},
): Promise<CompleteResponse> {
  const r = await fetch(`/api/v1/media/${mediaAssetId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`complete failed: ${r.status} ${text}`);
  }
  return r.json();
}

export type UploadOutcome = {
  media_asset_id: string;
  storage_key: string;
  voice_transcription_id?: string;
};

/**
 * One-shot media upload pipeline used by the dashboard's voice + photo flows.
 *   1. POST /api/v1/media/upload-url            → signed URL + media_asset_id
 *   2. PUT <signed_url>                         → file bytes
 *   3. POST /api/v1/media/[id]/complete         → flips upload_status,
 *                                                 server auto-triggers
 *                                                 transcription for audio.
 */
export async function uploadMedia(args: {
  preflight_session_id: string;
  blob: Blob;
  media_type: "audio" | "photo";
  file_name: string;
  mime_type: string;
  quick_tag?: QuickTag;
}): Promise<UploadOutcome> {
  const minted = await requestUploadUrl({
    preflight_session_id: args.preflight_session_id,
    media_type: args.media_type,
    file_name: args.file_name,
    mime_type: args.mime_type,
  });

  const putRes = await fetch(minted.signed_url, {
    method: "PUT",
    headers: { "Content-Type": args.mime_type },
    body: args.blob,
  });
  if (!putRes.ok) {
    const text = await putRes.text().catch(() => "");
    throw new Error(`upload PUT failed: ${putRes.status} ${text}`);
  }

  const completed = await completeMediaUpload(minted.media_asset_id, {
    file_size_bytes: args.blob.size,
    quick_tag: args.quick_tag,
  });

  return {
    media_asset_id: minted.media_asset_id,
    storage_key: minted.storage_key,
    voice_transcription_id: completed.voice_transcription_id,
  };
}

const AUDIO_EXT_BY_MIME: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "audio/m4a": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/wave": "wav",
};

export function audioFileNameForMime(mime: string): { name: string; ext: string } {
  const main = mime.split(";")[0].trim().toLowerCase();
  const ext = AUDIO_EXT_BY_MIME[main] ?? "webm";
  return { name: `voice-note.${ext}`, ext };
}
