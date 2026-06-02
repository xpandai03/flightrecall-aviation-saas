-- =====================================================================
-- Aircraft pre-flight checklist images (reuses media_assets)
--
-- ⚠️ FORWARD-ONLY, ADDITIVE. APPLY TO PROD MANUALLY *BEFORE* the code
-- that depends on it deploys. NOT applied by this branch; NOT via
-- `supabase db push`. Same manual-apply pattern as the prior M4
-- migrations.
--
-- Goal: store 1–2 checklist photos per aircraft in the EXISTING
-- media_assets table + storage bucket, linked to the AIRCRAFT (not a
-- preflight session). Replace-semantics + the 2-image cap are enforced
-- in application code; this migration only provides the link + access.
--
-- Non-destructive: every existing media_assets row is an observation
-- with preflight_session_id set, so it satisfies asset_role's default
-- ('observation') and the scope check below. No data is moved or dropped.
-- =====================================================================

-- (a) Link + role -----------------------------------------------------
alter table public.media_assets
  add column if not exists aircraft_id uuid
    references public.aircraft(id) on delete cascade,
  add column if not exists asset_role text not null default 'observation';

alter table public.media_assets
  add constraint media_assets_asset_role_chk
    check (asset_role in ('observation', 'checklist'));

-- (b) Checklist rows are session-less → relax the NOT NULL ------------
alter table public.media_assets
  alter column preflight_session_id drop not null;

-- (c) Scope integrity: observation = session-scoped; checklist =
--     aircraft-scoped + session-less. Existing rows all satisfy the
--     observation branch.
alter table public.media_assets
  add constraint media_assets_scope_chk check (
    (asset_role = 'observation' and preflight_session_id is not null)
    or
    (asset_role = 'checklist'   and aircraft_id is not null
                                and preflight_session_id is null)
  );

create index if not exists idx_media_assets_aircraft_checklist
  on public.media_assets (aircraft_id)
  where asset_role = 'checklist';

-- (d) RLS — the existing media_* policies scope ONLY via
--     preflight_session_id, which excludes session-less checklist rows.
--     Add aircraft-scoped permissive policies; Postgres OR-combines
--     permissive policies, so observation rows still match the session
--     policies and checklist rows match these.
create policy "media_select_own_aircraft" on public.media_assets
  for select to authenticated
  using (
    aircraft_id in (select id from public.aircraft where user_id = auth.uid())
  );

create policy "media_insert_own_aircraft" on public.media_assets
  for insert to authenticated
  with check (
    aircraft_id in (select id from public.aircraft where user_id = auth.uid())
  );

create policy "media_update_own_aircraft" on public.media_assets
  for update to authenticated
  using (
    aircraft_id in (select id from public.aircraft where user_id = auth.uid())
  )
  with check (
    aircraft_id in (select id from public.aircraft where user_id = auth.uid())
  );

create policy "media_delete_own_aircraft" on public.media_assets
  for delete to authenticated
  using (
    aircraft_id in (select id from public.aircraft where user_id = auth.uid())
  );

-- Rollback sketch (new migration if ever needed):
--   drop policy media_{select,insert,update,delete}_own_aircraft on public.media_assets;
--   drop index idx_media_assets_aircraft_checklist;
--   alter table public.media_assets drop constraint media_assets_scope_chk;
--   alter table public.media_assets drop constraint media_assets_asset_role_chk;
--   -- (re-adding NOT NULL requires no checklist rows to exist)
--   alter table public.media_assets drop column asset_role, drop column aircraft_id;
