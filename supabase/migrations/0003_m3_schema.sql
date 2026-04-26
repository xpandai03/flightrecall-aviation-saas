-- =====================================================================
-- Flight Recall — Milestone 3 schema
-- Adds:    issue_types, issues, issue_observations
-- Extends: media_assets.issue_id (FK)
-- Backfills: existing media_assets.quick_tag → issues + observations
--
-- Auth/RLS: still OUT OF SCOPE (M4 debt). This migration includes the
--          RLS-disable + anon-grants tail so the new tables fit the
--          same M1+M2 pattern. Will all be repaid in 0004_m4_rls_policies.sql.
--
-- M3-V1 limitations (documented in the consolidated debt section):
--   - An issue is identified by (aircraft_id, issue_type_id). A "scratch"
--     on the left wing and a "scratch" on the right wing are the same row,
--     disambiguated only by description text.
--   - Voice notes don't auto-create issues. Photos with quick_tag are the
--     only auto-creation path (NLP extraction is post-V1).
--   - For input_type='no_issues', preflight_sessions.status_color stays
--     locked to 'green' regardless of the algorithmic active-issue count.
--     Rationale: "No Issues" is a current preflight declaration, not an
--     aircraft-state declaration. M4+ may gate the No Issues button
--     behind "all active issues actioned" to make this honest, but V1
--     keeps it simple.
--   - media_assets.quick_tag column stays. It's the source of truth for
--     which issue type was tagged at the moment of capture; issue_id is
--     the FK that follows. Drop in QA cleanup once issue tracking is
--     verified across enough live sessions.
-- =====================================================================

create extension if not exists pgcrypto;

-- ----- issue_types ----------------------------------------------------
create table public.issue_types (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,   -- matches media_assets.quick_tag values
  name       text not null,
  created_at timestamptz not null default now()
);

insert into public.issue_types (slug, name) values
  ('scratch', 'Scratch'),
  ('dent',    'Dent'),
  ('tire',    'Tire'),
  ('oil',     'Oil'),
  ('other',   'Other');

-- ----- issues ---------------------------------------------------------
-- One row per (aircraft_id, issue_type_id). UPSERT on subsequent
-- observations of the same type for the same aircraft. Re-activation
-- (resolved → active) is supported via UPDATE, not INSERT.
create table public.issues (
  id              uuid primary key default gen_random_uuid(),
  aircraft_id     uuid not null references public.aircraft(id)    on delete cascade,
  issue_type_id   uuid not null references public.issue_types(id) on delete restrict,
  description     text,
  current_status  text not null default 'active'
                       check (current_status in ('active', 'resolved')),
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  resolved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (aircraft_id, issue_type_id)
);

create index idx_issues_aircraft_status on public.issues(aircraft_id, current_status);
create index idx_issues_last_seen       on public.issues(aircraft_id, last_seen_at desc);

-- Touch updated_at on row update.
create or replace function public.touch_issues_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger touch_issues_updated_at_trg
before update on public.issues
for each row execute function public.touch_issues_updated_at();

-- ----- issue_observations --------------------------------------------
-- Append-only history. One row per user action (or auto-log) tied to
-- a session. action enum:
--   logged  — initial observation that created or refreshed the issue
--             (currently only fired by photo uploads with quick_tag).
--   still   — pilot tapped "Still present" in carry-forward.
--   fixed   — pilot tapped "Fixed" in carry-forward.
--   skipped — pilot tapped "Skip" in carry-forward.
create table public.issue_observations (
  id                   uuid primary key default gen_random_uuid(),
  issue_id             uuid not null references public.issues(id)             on delete cascade,
  preflight_session_id uuid not null references public.preflight_sessions(id) on delete cascade,
  action               text not null
                            check (action in ('logged', 'still', 'fixed', 'skipped')),
  created_at           timestamptz not null default now()
);

create index idx_issue_obs_issue   on public.issue_observations(issue_id);
create index idx_issue_obs_session on public.issue_observations(preflight_session_id);

-- ----- media_assets.issue_id -----------------------------------------
alter table public.media_assets
  add column issue_id uuid references public.issues(id) on delete set null;

create index idx_media_assets_issue on public.media_assets(issue_id);

-- ----- Backfill from media_assets.quick_tag --------------------------
-- For each photo media_asset with a non-null quick_tag, find or create
-- the issue, insert a 'logged' observation tied to its preflight_session,
-- and link media_assets.issue_id. Walks in chronological order so
-- first_seen_at / last_seen_at land correctly when the same issue type
-- recurs across sessions for the same aircraft.
do $$
declare
  rec record;
  v_issue_type_id uuid;
  v_issue_id      uuid;
begin
  for rec in
    select ma.id            as media_id,
           ma.preflight_session_id,
           ma.quick_tag,
           ps.aircraft_id,
           ps.created_at    as session_created_at
    from public.media_assets ma
    join public.preflight_sessions ps on ps.id = ma.preflight_session_id
    where ma.quick_tag is not null
      and ma.media_type = 'photo'
    order by ps.created_at asc
  loop
    select id into v_issue_type_id
    from public.issue_types
    where slug = rec.quick_tag;

    if v_issue_type_id is null then
      raise notice 'no issue_type for slug %, skipping media_asset %', rec.quick_tag, rec.media_id;
      continue;
    end if;

    insert into public.issues
      (aircraft_id, issue_type_id, first_seen_at, last_seen_at, current_status)
    values
      (rec.aircraft_id, v_issue_type_id, rec.session_created_at, rec.session_created_at, 'active')
    on conflict (aircraft_id, issue_type_id) do update set
      last_seen_at  = greatest(public.issues.last_seen_at,  excluded.last_seen_at),
      first_seen_at = least(public.issues.first_seen_at,    excluded.first_seen_at),
      updated_at    = now()
    returning id into v_issue_id;

    update public.media_assets
       set issue_id = v_issue_id
     where id = rec.media_id;

    insert into public.issue_observations
      (issue_id, preflight_session_id, action, created_at)
    values
      (v_issue_id, rec.preflight_session_id, 'logged', rec.session_created_at);
  end loop;
end;
$$;

-- ----- RLS-disable + anon GRANTs (M4 debt, pre-emptive per M1+M2 pattern)
alter table public.issue_types         disable row level security;
alter table public.issues              disable row level security;
alter table public.issue_observations  disable row level security;

grant select, insert, update, delete on public.issue_types        to anon;
grant select, insert, update, delete on public.issues             to anon;
grant select, insert, update, delete on public.issue_observations to anon;
