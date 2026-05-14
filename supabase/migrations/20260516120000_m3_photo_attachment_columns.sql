-- =====================================================================
-- M3 Item 4 — Photo + voice/text attachment metadata on media_assets
-- Companion audio rows use voice_transcriptions as today; photos point
-- at the transcript row via voice_transcription_id.
-- =====================================================================

alter table public.media_assets
  add column if not exists voice_transcription_id uuid
    references public.voice_transcriptions(id) on delete set null;

alter table public.media_assets
  add column if not exists note_text text;

create index if not exists idx_media_assets_voice_transcription_id
  on public.media_assets(voice_transcription_id)
  where voice_transcription_id is not null;
