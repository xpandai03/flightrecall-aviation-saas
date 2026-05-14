/**
 * Photo-attached voice uses a companion audio `media_assets` row as the
 * Whisper storage target; `voice_transcriptions.media_asset_id` points at
 * that audio row, while the photo row's `voice_transcription_id` points at
 * the transcript. These helpers hide companion audio from standalone-voice
 * surfaces and hide attached transcripts from Phase 3 standalone edit UI.
 */

export type MediaAttachmentFilterRow = {
  id: string;
  media_type: string;
  voice_transcription_id: string | null;
};

export type TranscriptFilterRow = {
  id: string;
  media_asset_id: string;
};

/** True when this audio row is only the storage leg for a photo's voice note. */
export function isCompanionPhotoVoiceAudio(
  audioAssetId: string,
  mediaRows: MediaAttachmentFilterRow[],
  transcripts: TranscriptFilterRow[],
): boolean {
  const photoTxIds = new Set(
    mediaRows
      .filter((m) => m.media_type === "photo" && m.voice_transcription_id)
      .map((m) => m.voice_transcription_id as string),
  );
  if (photoTxIds.size === 0) return false;
  return transcripts.some(
    (t) => t.media_asset_id === audioAssetId && photoTxIds.has(t.id),
  );
}

/** Transcripts linked from a photo attachment must not use EditableTranscript. */
export function isPhotoAttachedTranscript(
  transcriptionId: string,
  mediaRows: MediaAttachmentFilterRow[],
): boolean {
  return mediaRows.some(
    (m) =>
      m.media_type === "photo" &&
      m.voice_transcription_id === transcriptionId,
  );
}
