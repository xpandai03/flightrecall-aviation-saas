-- =====================================================================
-- Flight Recall — Milestone 1 schema
-- Tables: aircraft, preflight_sessions, media_assets
-- Auth:   intentionally OUT OF SCOPE for M1.
-- RLS:    intentionally NOT ENABLED for M1. Without auth, RLS would
--         block every read/write. RLS will be enabled in Milestone 4
--         alongside Supabase Auth integration.
-- =====================================================================

-- ----- Extensions -----------------------------------------------------
-- gen_random_uuid() requires pgcrypto. On modern Supabase projects this
-- is already installed, but we declare it here so the migration is
-- self-contained.
create extension if not exists pgcrypto;

-- =====================================================================
-- aircraft
-- One row in M1 (N739X seeded at the bottom). Real schema so we don't
-- have to migrate the column shape later when we add a picker.
-- =====================================================================
create table public.aircraft (
  id          uuid primary key default gen_random_uuid(),
  tail_number text not null unique,
  make        text,
  model       text,
  year        int,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Normalize tail number on insert/update (uppercase, strip whitespace),
-- and bump updated_at.
create or replace function public.normalize_tail_number()
returns trigger
language plpgsql
as $$
begin
  new.tail_number := upper(regexp_replace(new.tail_number, '\s+', '', 'g'));
  new.updated_at  := now();
  return new;
end;
$$;

create trigger normalize_tail_number_trigger
before insert or update on public.aircraft
for each row execute function public.normalize_tail_number();

-- =====================================================================
-- preflight_sessions
-- A single preflight observation captured by the pilot. Minimal in M1
-- (no observations table yet — that's M3).
-- =====================================================================
create table public.preflight_sessions (
  id              uuid primary key default gen_random_uuid(),
  aircraft_id     uuid not null references public.aircraft(id) on delete restrict,
  input_type      text not null check (input_type in ('photo', 'voice', 'no_issues')),
  status_color    text       check (status_color in ('green', 'yellow', 'red')),
  notes_text      text,
  transcript_text text,
  created_at      timestamptz not null default now(),
  finalized_at    timestamptz
);

create index idx_preflight_sessions_aircraft_id
  on public.preflight_sessions(aircraft_id);

create index idx_preflight_sessions_created_at
  on public.preflight_sessions(created_at desc);

-- =====================================================================
-- media_assets
-- A photo or audio file attached to a preflight_session. The file lives
-- in the `flight-recall-media` Storage bucket; storage_key is the path
-- inside that bucket. upload_status tracks the two-step upload pattern:
-- (1) row inserted with 'pending', signed URL returned;
-- (2) client PUTs the file, then we (or the client) flip to 'uploaded'.
-- =====================================================================
create table public.media_assets (
  id                   uuid primary key default gen_random_uuid(),
  preflight_session_id uuid not null references public.preflight_sessions(id) on delete cascade,
  media_type           text not null check (media_type in ('photo', 'audio')),
  storage_key          text not null,
  file_name            text,
  mime_type            text,
  file_size_bytes      bigint,
  upload_status        text not null default 'pending'
                              check (upload_status in ('pending', 'uploaded', 'failed')),
  created_at           timestamptz not null default now()
);

create index idx_media_assets_session_id
  on public.media_assets(preflight_session_id);

-- =====================================================================
-- Seed: the single M1 aircraft
-- The trigger will normalize 'N739X' → 'N739X' (no-op here, but proves
-- the path).
-- =====================================================================
insert into public.aircraft (tail_number, make, model)
values ('N739X', 'Cessna', '172');
