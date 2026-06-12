-- =====================================================================
-- Shared Aircraft — PHASE 1: membership model + attribution + RLS rewrite
--
-- ⚠️ FORWARD-ONLY. DO NOT `supabase db push`. APPLY MANUALLY (in one
-- transaction) AFTER REVIEW and BEFORE any Phase 2+ application code
-- deploys. Plan: shared-aircraft-plan.md §3.2, §5.2, §5.5, §6.
--
-- Goal: lay the schema + access-control foundation so co-pilots can share
-- an aircraft via membership and see each other's logs — and NOTHING else.
-- This migration is ACCESS-EQUIVALENT TO TODAY on apply: the backfill
-- creates OWNER-ONLY membership, so every existing user's visibility is
-- byte-for-byte unchanged until a pilot is deliberately added (Phase 2,
-- invite-code — NOT enabled here).
--
-- Signed-off decisions implemented:
--   D1 invite-code join → Phase 1 enables NO open join / NO self-insert
--      membership (default-deny: aircraft_members has only a SELECT policy).
--   D2 existing aircraft stay private → backfill is owner-only membership.
--   D4 profiles expose first_name only, to co-members only.
--   D5 delete = creator-only; update = any member.
--   D6/D7 leave keeps logs; historical created_by ← aircraft owner.
--
-- ⚠️ ORDERING IS LOAD-BEARING (single transaction, top-to-bottom):
--   1) create aircraft_members  →  2) BACKFILL membership  →
--   3) profiles + created_by cols + created_by backfill  →
--   4) is_aircraft_member()  →  5) RLS SWAP (drop owner policies, create
--      membership policies).
--   The membership backfill (2) and the helper (4) MUST exist before the
--   RLS swap (5). If RLS were swapped to membership before aircraft_members
--   is populated, every owner would instantly lose access to their own
--   data. Keeping it all in ONE migration/transaction guarantees the order.
--
-- The tail_number UNIQUE constraint is NOT dropped (plan §3.1): one
-- canonical aircraft row per tail; sharing is via membership. The
-- join-existing-tail behavior is Phase 2 (app code).
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) Membership junction
-- ---------------------------------------------------------------------
create table public.aircraft_members (
  aircraft_id uuid not null references public.aircraft(id) on delete cascade,
  user_id     uuid not null references auth.users(id)      on delete cascade,
  role        text not null default 'pilot' check (role in ('owner', 'pilot')),
  created_at  timestamptz not null default now(),
  primary key (aircraft_id, user_id)
);
create index idx_aircraft_members_user on public.aircraft_members(user_id);

-- ---------------------------------------------------------------------
-- (2) BACKFILL membership FIRST — owner-only (D2). Runs as the migration
--     role (bypasses RLS), so it populates regardless of the policies
--     installed in step (5). This must precede the RLS swap.
-- ---------------------------------------------------------------------
insert into public.aircraft_members (aircraft_id, user_id, role)
select id, user_id, 'owner'
from public.aircraft
on conflict (aircraft_id, user_id) do nothing;

-- ---------------------------------------------------------------------
-- (3a) profiles — minimal identity for "logged by {pilot}" (D4).
--      first_name only; populated in Phase 3. Email NOT stored here.
-- ---------------------------------------------------------------------
create table public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- (3b) Attribution columns — nullable, additive. created_by write-sites
--      are wired in Phase 3; here we only add + backfill.
-- ---------------------------------------------------------------------
alter table public.preflight_sessions add column if not exists created_by uuid references auth.users(id);
alter table public.issues             add column if not exists created_by uuid references auth.users(id);
alter table public.issue_observations add column if not exists created_by uuid references auth.users(id);
alter table public.media_assets       add column if not exists created_by uuid references auth.users(id);

-- ---------------------------------------------------------------------
-- (3c) BACKFILL created_by ← the aircraft's current owner (D7). Under the
--      single-owner model that user is the only possible author. Order
--      matters: issues before issue_observations (the latter derives from
--      issues.created_by).
-- ---------------------------------------------------------------------
update public.preflight_sessions s
   set created_by = a.user_id
  from public.aircraft a
 where s.aircraft_id = a.id and s.created_by is null;

update public.issues i
   set created_by = a.user_id
  from public.aircraft a
 where i.aircraft_id = a.id and i.created_by is null;

update public.issue_observations o
   set created_by = i.created_by
  from public.issues i
 where o.issue_id = i.id and o.created_by is null;

-- checklist media (aircraft-linked) → aircraft owner
update public.media_assets m
   set created_by = a.user_id
  from public.aircraft a
 where m.aircraft_id = a.id and m.created_by is null;

-- session media (session-linked) → session creator
update public.media_assets m
   set created_by = s.created_by
  from public.preflight_sessions s
 where m.preflight_session_id = s.id and m.created_by is null;

-- ---------------------------------------------------------------------
-- (4) Membership helper — used by every rewritten policy in step (5).
--     security definer so it can read aircraft_members regardless of that
--     table's own RLS, but it ONLY ever tests the CURRENT user's
--     membership (auth.uid()), so it cannot be used to read others' rows.
-- ---------------------------------------------------------------------
create or replace function public.is_aircraft_member(aid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.aircraft_members m
    where m.aircraft_id = aid
      and m.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------
-- (5) Grants + RLS on the NEW tables.
-- ---------------------------------------------------------------------
-- Phase 1: aircraft_members is READ-ONLY for authenticated (defense in
-- depth — no write privilege AND no write RLS policy). The invite-code
-- join (Phase 2) will grant insert + add the gated insert policy together.
grant select                  on public.aircraft_members to authenticated;
grant select, insert, update  on public.profiles         to authenticated;

alter table public.aircraft_members enable row level security;
alter table public.profiles         enable row level security;

-- aircraft_members: a member may SEE the roster of aircraft they belong to
-- (renders "shared with"). NO insert/update/delete policy in Phase 1 →
-- RLS default-denies them for `authenticated`, so a user CANNOT add
-- themselves to (or read the roster of) an aircraft they don't belong to.
-- The invite-code join that inserts membership is Phase 2. The backfill
-- above ran as the migration role and is unaffected by this.
create policy "aircraft_members_select_member" on public.aircraft_members
  for select to authenticated
  using (public.is_aircraft_member(aircraft_id));

-- profiles: read your own, and any co-member's (so the UI can show
-- "logged by {first_name}") — nothing else. Upsert/update self only.
create policy "profiles_select_self_or_comember" on public.profiles
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.aircraft_members me
      join public.aircraft_members them on them.aircraft_id = me.aircraft_id
      where me.user_id = auth.uid()
        and them.user_id = profiles.user_id
    )
  );
create policy "profiles_insert_self" on public.profiles
  for insert to authenticated
  with check (user_id = auth.uid());
create policy "profiles_update_self" on public.profiles
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- =====================================================================
-- (6) RLS SWAP — replace every owner-scoped policy with a membership-
-- scoped one. Drop-then-create runs in this single transaction, so the
-- intermediate state is never visible to other sessions.
--
-- Pattern:
--   SELECT / INSERT / UPDATE → membership (is_aircraft_member of the
--     row's own aircraft). For Phase 1 (owner-only membership) this is
--     identical to today.
--   DELETE → creator-only (membership AND created_by = auth.uid()) per
--     D5 — "a pilot can't delete another's session/photo." (Voice
--     transcriptions have no created_by; they are creator-gated via their
--     parent session.)
--   aircraft INSERT/UPDATE/DELETE stay OWNER-scoped (user_id = auth.uid())
--     — exactly today's behavior; broadening aircraft management to any
--     member is a deliberate Phase 2 decision, not a Phase 1 side effect.
-- =====================================================================

-- ----- aircraft ------------------------------------------------------
drop policy "aircraft_select_own" on public.aircraft;
drop policy "aircraft_insert_own" on public.aircraft;
drop policy "aircraft_update_own" on public.aircraft;
drop policy "aircraft_delete_own" on public.aircraft;

create policy "aircraft_select_member" on public.aircraft
  for select to authenticated
  using (public.is_aircraft_member(id));

create policy "aircraft_insert_self" on public.aircraft
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "aircraft_update_owner" on public.aircraft
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "aircraft_delete_owner" on public.aircraft
  for delete to authenticated
  using (user_id = auth.uid());

-- ----- preflight_sessions -------------------------------------------
drop policy "sessions_select_own" on public.preflight_sessions;
drop policy "sessions_insert_own" on public.preflight_sessions;
drop policy "sessions_update_own" on public.preflight_sessions;
drop policy "sessions_delete_own" on public.preflight_sessions;

create policy "sessions_select_member" on public.preflight_sessions
  for select to authenticated
  using (public.is_aircraft_member(aircraft_id));

create policy "sessions_insert_member" on public.preflight_sessions
  for insert to authenticated
  with check (public.is_aircraft_member(aircraft_id));

create policy "sessions_update_member" on public.preflight_sessions
  for update to authenticated
  using (public.is_aircraft_member(aircraft_id))
  with check (public.is_aircraft_member(aircraft_id));

create policy "sessions_delete_creator" on public.preflight_sessions
  for delete to authenticated
  using (public.is_aircraft_member(aircraft_id) and created_by = auth.uid());

-- ----- media_assets (session-linked OR checklist aircraft-linked) ---
-- Replaces BOTH the session-scoped (media_*_own) and the checklist
-- (media_*_own_aircraft) policy sets with one consolidated set covering
-- both shapes.
drop policy "media_select_own"          on public.media_assets;
drop policy "media_insert_own"          on public.media_assets;
drop policy "media_update_own"          on public.media_assets;
drop policy "media_delete_own"          on public.media_assets;
drop policy "media_select_own_aircraft" on public.media_assets;
drop policy "media_insert_own_aircraft" on public.media_assets;
drop policy "media_update_own_aircraft" on public.media_assets;
drop policy "media_delete_own_aircraft" on public.media_assets;

create policy "media_select_member" on public.media_assets
  for select to authenticated
  using (
    (preflight_session_id is not null and exists (
      select 1 from public.preflight_sessions s
      where s.id = media_assets.preflight_session_id
        and public.is_aircraft_member(s.aircraft_id)
    ))
    or (aircraft_id is not null and public.is_aircraft_member(aircraft_id))
  );

create policy "media_insert_member" on public.media_assets
  for insert to authenticated
  with check (
    (preflight_session_id is not null and exists (
      select 1 from public.preflight_sessions s
      where s.id = media_assets.preflight_session_id
        and public.is_aircraft_member(s.aircraft_id)
    ))
    or (aircraft_id is not null and public.is_aircraft_member(aircraft_id))
  );

create policy "media_update_member" on public.media_assets
  for update to authenticated
  using (
    (preflight_session_id is not null and exists (
      select 1 from public.preflight_sessions s
      where s.id = media_assets.preflight_session_id
        and public.is_aircraft_member(s.aircraft_id)
    ))
    or (aircraft_id is not null and public.is_aircraft_member(aircraft_id))
  )
  with check (
    (preflight_session_id is not null and exists (
      select 1 from public.preflight_sessions s
      where s.id = media_assets.preflight_session_id
        and public.is_aircraft_member(s.aircraft_id)
    ))
    or (aircraft_id is not null and public.is_aircraft_member(aircraft_id))
  );

-- DELETE = creator-only (covers "another's photo" per D5; applies to both
-- session photos and checklist images). Relaxing checklist-image removal
-- to any-member (shared-checklist management) is a deliberate Phase 2
-- option, intentionally NOT taken here.
create policy "media_delete_creator" on public.media_assets
  for delete to authenticated
  using (
    created_by = auth.uid()
    and (
      (preflight_session_id is not null and exists (
        select 1 from public.preflight_sessions s
        where s.id = media_assets.preflight_session_id
          and public.is_aircraft_member(s.aircraft_id)
      ))
      or (aircraft_id is not null and public.is_aircraft_member(aircraft_id))
    )
  );

-- ----- voice_transcriptions (via session) ---------------------------
drop policy "voice_tx_select_own" on public.voice_transcriptions;
drop policy "voice_tx_insert_own" on public.voice_transcriptions;
drop policy "voice_tx_update_own" on public.voice_transcriptions;
drop policy "voice_tx_delete_own" on public.voice_transcriptions;

create policy "voice_tx_select_member" on public.voice_transcriptions
  for select to authenticated
  using (exists (
    select 1 from public.preflight_sessions s
    where s.id = voice_transcriptions.preflight_session_id
      and public.is_aircraft_member(s.aircraft_id)
  ));

create policy "voice_tx_insert_member" on public.voice_transcriptions
  for insert to authenticated
  with check (exists (
    select 1 from public.preflight_sessions s
    where s.id = voice_transcriptions.preflight_session_id
      and public.is_aircraft_member(s.aircraft_id)
  ));

create policy "voice_tx_update_member" on public.voice_transcriptions
  for update to authenticated
  using (exists (
    select 1 from public.preflight_sessions s
    where s.id = voice_transcriptions.preflight_session_id
      and public.is_aircraft_member(s.aircraft_id)
  ))
  with check (exists (
    select 1 from public.preflight_sessions s
    where s.id = voice_transcriptions.preflight_session_id
      and public.is_aircraft_member(s.aircraft_id)
  ));

-- DELETE = creator-only via the parent session (voice_transcriptions has
-- no created_by; its author is the session's creator).
create policy "voice_tx_delete_creator" on public.voice_transcriptions
  for delete to authenticated
  using (exists (
    select 1 from public.preflight_sessions s
    where s.id = voice_transcriptions.preflight_session_id
      and public.is_aircraft_member(s.aircraft_id)
      and s.created_by = auth.uid()
  ));

-- ----- issues --------------------------------------------------------
drop policy "issues_select_own" on public.issues;
drop policy "issues_insert_own" on public.issues;
drop policy "issues_update_own" on public.issues;
drop policy "issues_delete_own" on public.issues;

create policy "issues_select_member" on public.issues
  for select to authenticated
  using (public.is_aircraft_member(aircraft_id));

create policy "issues_insert_member" on public.issues
  for insert to authenticated
  with check (public.is_aircraft_member(aircraft_id));

-- UPDATE = any member (observe / resolve is shared aircraft state, D5).
create policy "issues_update_member" on public.issues
  for update to authenticated
  using (public.is_aircraft_member(aircraft_id))
  with check (public.is_aircraft_member(aircraft_id));

create policy "issues_delete_creator" on public.issues
  for delete to authenticated
  using (public.is_aircraft_member(aircraft_id) and created_by = auth.uid());

-- ----- issue_observations (via issue) -------------------------------
drop policy "issue_obs_select_own" on public.issue_observations;
drop policy "issue_obs_insert_own" on public.issue_observations;
drop policy "issue_obs_update_own" on public.issue_observations;
drop policy "issue_obs_delete_own" on public.issue_observations;

create policy "issue_obs_select_member" on public.issue_observations
  for select to authenticated
  using (exists (
    select 1 from public.issues i
    where i.id = issue_observations.issue_id
      and public.is_aircraft_member(i.aircraft_id)
  ));

create policy "issue_obs_insert_member" on public.issue_observations
  for insert to authenticated
  with check (exists (
    select 1 from public.issues i
    where i.id = issue_observations.issue_id
      and public.is_aircraft_member(i.aircraft_id)
  ));

create policy "issue_obs_update_member" on public.issue_observations
  for update to authenticated
  using (exists (
    select 1 from public.issues i
    where i.id = issue_observations.issue_id
      and public.is_aircraft_member(i.aircraft_id)
  ))
  with check (exists (
    select 1 from public.issues i
    where i.id = issue_observations.issue_id
      and public.is_aircraft_member(i.aircraft_id)
  ));

-- DELETE = creator-only.
create policy "issue_obs_delete_creator" on public.issue_observations
  for delete to authenticated
  using (
    created_by = auth.uid()
    and exists (
      select 1 from public.issues i
      where i.id = issue_observations.issue_id
        and public.is_aircraft_member(i.aircraft_id)
    )
  );

-- issue_types: global reference data — policy "issue_types_read_all_authed"
-- is intentionally UNCHANGED.

-- =====================================================================
-- ROLLBACK (run as a NEW forward migration if ever needed; not expected).
-- Reversible because nothing was destroyed — only additive objects + a
-- policy swap.
-- ---------------------------------------------------------------------
-- begin;
--   -- restore owner-scoped policies (verbatim from
--   -- 20260426012516_m4_lockdown_and_enable_rls.sql and
--   -- 20260602130000_m4_aircraft_checklist_media.sql), after dropping the
--   -- *_member / *_creator / *_self / *_owner policies created above.
--   -- aircraft_select_member, aircraft_insert_self, aircraft_update_owner,
--   -- aircraft_delete_owner, sessions_*_member/_creator,
--   -- media_*_member/_creator, voice_tx_*_member/_creator,
--   -- issues_*_member/_creator, issue_obs_*_member/_creator,
--   -- aircraft_members_select_member, profiles_*  → drop.
--   drop function if exists public.is_aircraft_member(uuid);
--   alter table public.preflight_sessions drop column if exists created_by;
--   alter table public.issues             drop column if exists created_by;
--   alter table public.issue_observations drop column if exists created_by;
--   alter table public.media_assets       drop column if exists created_by;
--   drop table if exists public.profiles;
--   drop table if exists public.aircraft_members;
-- commit;
-- =====================================================================
