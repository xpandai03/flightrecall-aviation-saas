-- =====================================================================
-- Flight Recall — Milestone 2 schema
-- Adds: voice_transcriptions, media_assets.quick_tag
-- Auth: still OUT OF SCOPE (M4).
-- RLS:  intentionally NOT enabled on the new table, consistent with the
--       M1 deferral. The consolidated debt section in
--       docs/plans/m1-supabase-integration.md is the canonical tracker;
--       M4's 0002_m4_rls_policies.sql (or its successor number) will
--       re-enable RLS, revoke the broad anon grants, and add policies
--       on aircraft, preflight_sessions, media_assets,
--       voice_transcriptions (this table), and the storage bucket all
--       in one atomic apply.
-- M2-to-M3 debt:
--       media_assets.quick_tag is a flat enum-checked text column. M3
--       will introduce public.issue_types + public.issues and migrate
--       quick_tag values into proper rows, then drop this column. See
--       §4 of docs/plans/m2-voice-photo-capture.md.
-- =====================================================================

-- ----- voice_transcriptions ------------------------------------------
-- One row per audio media_asset. Status flips through
-- pending → processing → completed | failed.
-- The unique constraint on media_asset_id ensures we don't double-
-- transcribe the same audio (M2 has no retry UI).
create table public.voice_transcriptions (
  id                    uuid primary key default gen_random_uuid(),
  media_asset_id        uuid not null unique references public.media_assets(id)        on delete cascade,
  preflight_session_id  uuid not null         references public.preflight_sessions(id) on delete cascade,
  transcription_status  text not null default 'pending'
                              check (transcription_status in ('pending','processing','completed','failed')),
  transcript_text       text,
  language              text,
  duration_seconds      numeric,
  model                 text not null default 'gpt-4o-mini-transcribe',
  error_message         text,
  created_at            timestamptz not null default now(),
  started_at            timestamptz,
  completed_at          timestamptz
);

create index idx_voice_transcriptions_session_id
  on public.voice_transcriptions(preflight_session_id);

create index idx_voice_transcriptions_status
  on public.voice_transcriptions(transcription_status);

-- ----- media_assets.quick_tag ----------------------------------------
-- One-tap photo tag, M2-only shape. Values constrained narrow to catch
-- typos; M3 will replace with a FK to issue_types and migrate the
-- existing values (see plan §4).
alter table public.media_assets
  add column quick_tag text
    check (quick_tag in ('scratch','dent','tire','oil','other'));
