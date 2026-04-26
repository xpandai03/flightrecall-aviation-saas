-- =====================================================================
-- M4 #3 — Lockdown + auth-scoped RLS on the seven public tables
--
-- Sequence (everything runs in one transaction, all-or-nothing):
--   (a) Now that aircraft is empty, set user_id NOT NULL.
--   (b) Revoke all anon CRUD on the seven tables.
--   (c) Grant CRUD to authenticated (read-only on issue_types).
--   (d) Enable RLS on all seven tables.
--   (e) Install the auth-scoped policy set.
--
-- After this migration applies, any anon-key request to these tables
-- returns 401-equivalent (via PostgREST policy checks). Only requests
-- carrying a valid user JWT see data, and they only see their own.
-- =====================================================================

-- (a) NOT NULL on the new owner column ---------------------------------
alter table public.aircraft
  alter column user_id set not null;

-- (b) Revoke anon CRUD on every M1+M2+M3 table -------------------------
revoke select, insert, update, delete on public.aircraft             from anon;
revoke select, insert, update, delete on public.preflight_sessions   from anon;
revoke select, insert, update, delete on public.media_assets         from anon;
revoke select, insert, update, delete on public.voice_transcriptions from anon;
revoke select, insert, update, delete on public.issues               from anon;
revoke select, insert, update, delete on public.issue_observations   from anon;
revoke select, insert, update, delete on public.issue_types          from anon;

-- (c) Grant CRUD to authenticated (issue_types is read-only) -----------
grant select, insert, update, delete on public.aircraft             to authenticated;
grant select, insert, update, delete on public.preflight_sessions   to authenticated;
grant select, insert, update, delete on public.media_assets         to authenticated;
grant select, insert, update, delete on public.voice_transcriptions to authenticated;
grant select, insert, update, delete on public.issues               to authenticated;
grant select, insert, update, delete on public.issue_observations   to authenticated;
grant select                          on public.issue_types          to authenticated;

-- (d) Enable RLS on all seven tables -----------------------------------
alter table public.aircraft             enable row level security;
alter table public.preflight_sessions   enable row level security;
alter table public.media_assets         enable row level security;
alter table public.voice_transcriptions enable row level security;
alter table public.issues               enable row level security;
alter table public.issue_observations   enable row level security;
alter table public.issue_types          enable row level security;

-- (e) Policy set -------------------------------------------------------

-- aircraft: direct ownership via user_id
create policy "aircraft_select_own" on public.aircraft
  for select to authenticated
  using (user_id = auth.uid());

create policy "aircraft_insert_own" on public.aircraft
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "aircraft_update_own" on public.aircraft
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "aircraft_delete_own" on public.aircraft
  for delete to authenticated
  using (user_id = auth.uid());

-- preflight_sessions: scoped via aircraft.user_id
create policy "sessions_select_own" on public.preflight_sessions
  for select to authenticated
  using (
    aircraft_id in (select id from public.aircraft where user_id = auth.uid())
  );

create policy "sessions_insert_own" on public.preflight_sessions
  for insert to authenticated
  with check (
    aircraft_id in (select id from public.aircraft where user_id = auth.uid())
  );

create policy "sessions_update_own" on public.preflight_sessions
  for update to authenticated
  using (
    aircraft_id in (select id from public.aircraft where user_id = auth.uid())
  )
  with check (
    aircraft_id in (select id from public.aircraft where user_id = auth.uid())
  );

create policy "sessions_delete_own" on public.preflight_sessions
  for delete to authenticated
  using (
    aircraft_id in (select id from public.aircraft where user_id = auth.uid())
  );

-- media_assets: scoped via session → aircraft → user
create policy "media_select_own" on public.media_assets
  for select to authenticated
  using (
    preflight_session_id in (
      select s.id from public.preflight_sessions s
      join public.aircraft a on a.id = s.aircraft_id
      where a.user_id = auth.uid()
    )
  );

create policy "media_insert_own" on public.media_assets
  for insert to authenticated
  with check (
    preflight_session_id in (
      select s.id from public.preflight_sessions s
      join public.aircraft a on a.id = s.aircraft_id
      where a.user_id = auth.uid()
    )
  );

create policy "media_update_own" on public.media_assets
  for update to authenticated
  using (
    preflight_session_id in (
      select s.id from public.preflight_sessions s
      join public.aircraft a on a.id = s.aircraft_id
      where a.user_id = auth.uid()
    )
  )
  with check (
    preflight_session_id in (
      select s.id from public.preflight_sessions s
      join public.aircraft a on a.id = s.aircraft_id
      where a.user_id = auth.uid()
    )
  );

create policy "media_delete_own" on public.media_assets
  for delete to authenticated
  using (
    preflight_session_id in (
      select s.id from public.preflight_sessions s
      join public.aircraft a on a.id = s.aircraft_id
      where a.user_id = auth.uid()
    )
  );

-- voice_transcriptions: scoped via session → aircraft → user
create policy "voice_tx_select_own" on public.voice_transcriptions
  for select to authenticated
  using (
    preflight_session_id in (
      select s.id from public.preflight_sessions s
      join public.aircraft a on a.id = s.aircraft_id
      where a.user_id = auth.uid()
    )
  );

create policy "voice_tx_insert_own" on public.voice_transcriptions
  for insert to authenticated
  with check (
    preflight_session_id in (
      select s.id from public.preflight_sessions s
      join public.aircraft a on a.id = s.aircraft_id
      where a.user_id = auth.uid()
    )
  );

create policy "voice_tx_update_own" on public.voice_transcriptions
  for update to authenticated
  using (
    preflight_session_id in (
      select s.id from public.preflight_sessions s
      join public.aircraft a on a.id = s.aircraft_id
      where a.user_id = auth.uid()
    )
  )
  with check (
    preflight_session_id in (
      select s.id from public.preflight_sessions s
      join public.aircraft a on a.id = s.aircraft_id
      where a.user_id = auth.uid()
    )
  );

create policy "voice_tx_delete_own" on public.voice_transcriptions
  for delete to authenticated
  using (
    preflight_session_id in (
      select s.id from public.preflight_sessions s
      join public.aircraft a on a.id = s.aircraft_id
      where a.user_id = auth.uid()
    )
  );

-- issues: scoped via aircraft.user_id
create policy "issues_select_own" on public.issues
  for select to authenticated
  using (
    aircraft_id in (select id from public.aircraft where user_id = auth.uid())
  );

create policy "issues_insert_own" on public.issues
  for insert to authenticated
  with check (
    aircraft_id in (select id from public.aircraft where user_id = auth.uid())
  );

create policy "issues_update_own" on public.issues
  for update to authenticated
  using (
    aircraft_id in (select id from public.aircraft where user_id = auth.uid())
  )
  with check (
    aircraft_id in (select id from public.aircraft where user_id = auth.uid())
  );

create policy "issues_delete_own" on public.issues
  for delete to authenticated
  using (
    aircraft_id in (select id from public.aircraft where user_id = auth.uid())
  );

-- issue_observations: scoped via issue → aircraft → user
create policy "issue_obs_select_own" on public.issue_observations
  for select to authenticated
  using (
    issue_id in (
      select i.id from public.issues i
      join public.aircraft a on a.id = i.aircraft_id
      where a.user_id = auth.uid()
    )
  );

create policy "issue_obs_insert_own" on public.issue_observations
  for insert to authenticated
  with check (
    issue_id in (
      select i.id from public.issues i
      join public.aircraft a on a.id = i.aircraft_id
      where a.user_id = auth.uid()
    )
  );

create policy "issue_obs_update_own" on public.issue_observations
  for update to authenticated
  using (
    issue_id in (
      select i.id from public.issues i
      join public.aircraft a on a.id = i.aircraft_id
      where a.user_id = auth.uid()
    )
  )
  with check (
    issue_id in (
      select i.id from public.issues i
      join public.aircraft a on a.id = i.aircraft_id
      where a.user_id = auth.uid()
    )
  );

create policy "issue_obs_delete_own" on public.issue_observations
  for delete to authenticated
  using (
    issue_id in (
      select i.id from public.issues i
      join public.aircraft a on a.id = i.aircraft_id
      where a.user_id = auth.uid()
    )
  );

-- issue_types: global reference data, read-only for any authenticated user
create policy "issue_types_read_all_authed" on public.issue_types
  for select to authenticated
  using (true);
