-- =====================================================================
-- MANUAL RLS VERIFICATION — open join by tail + owner-OR-creator delete.
--
-- This repo has NO automated DB/RLS harness (vitest is node-only, lib-only),
-- so the RLS-behavioral acceptance tests live here as a runnable script.
-- Run it on a SCRATCH database that already has BOTH:
--   20260611120000_shared_aircraft_phase1_membership_rls.sql  AND
--   20260611130000_shared_aircraft_phase2_invite_join.sql     applied,
-- THEN this branch's 20260615120000_shared_aircraft_open_join_by_tail.sql.
--
-- It wraps everything in a transaction and ROLLS BACK at the end, so it
-- mutates nothing permanently. It simulates two end users (OWNER, PILOT) by
-- setting the JWT claim `sub` (which auth.uid() reads) and the `authenticated`
-- role, exactly as PostgREST does per request.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f \
--     supabase/tests/open_join_by_tail_rls_checks.sql
--
-- Every check is an `assert` via do-blocks; the script raises (and aborts) on
-- the first failed expectation. "ALL OPEN-JOIN RLS CHECKS PASSED" at the end
-- = success.
-- =====================================================================

begin;

-- --- helpers to act as a given user (mirrors a PostgREST request) --------
create or replace function pg_temp.act_as(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
                     json_build_object('sub', p_uid::text, 'role', 'authenticated')::text,
                     true);
end;
$$;

create or replace function pg_temp.act_as_admin() returns void
language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);  -- bypass RLS for setup/asserts
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- --- fixture: two users, two aircraft (X owned by OWNER, Y by STRANGER) ---
do $$
declare
  v_owner    uuid := '11111111-1111-1111-1111-111111111111';
  v_pilot    uuid := '22222222-2222-2222-2222-222222222222';
  v_stranger uuid := '33333333-3333-3333-3333-333333333333';
  v_ax uuid; v_ay uuid;
  v_sx uuid;   -- a session on X created by OWNER
  v_sx_pilot uuid; -- a session on X created by PILOT (after join)
  v_joined uuid;
  v_cnt int;
begin
  perform pg_temp.act_as_admin();

  -- Seed auth.users (FK targets). Ignore if they already exist.
  insert into auth.users (id, email) values
    (v_owner, 'owner@test.local'),
    (v_pilot, 'pilot@test.local'),
    (v_stranger, 'stranger@test.local')
  on conflict (id) do nothing;

  -- Aircraft X (OWNER) and Y (STRANGER). Triggers normalize the tail.
  insert into public.aircraft (user_id, tail_number, aircraft_type)
    values (v_owner, 'n12345', 'Cessna 172') returning id into v_ax;
  insert into public.aircraft (user_id, tail_number, aircraft_type)
    values (v_stranger, 'N99999', 'Piper Cherokee') returning id into v_ay;

  -- Owner-membership rows (the app/trigger is responsible for these on
  -- create; seed them here so the scenario matches a healthy prod row).
  insert into public.aircraft_members (aircraft_id, user_id, role) values
    (v_ax, v_owner, 'owner'),
    (v_ay, v_stranger, 'owner')
  on conflict do nothing;

  -- A session on X authored by the OWNER.
  insert into public.preflight_sessions (aircraft_id, input_type, created_by)
    values (v_ax, 'no_issues', v_owner) returning id into v_sx;

  -- =================================================================
  -- (1) OPEN JOIN by matching tail+type → PILOT becomes a member of X.
  -- =================================================================
  perform pg_temp.act_as(v_pilot);
  select public.join_aircraft_by_tail(' n12 345 ', '  cessna 172 ') into v_joined;
  assert v_joined = v_ax, '(1) open join with matching tail+type should return X';

  perform pg_temp.act_as_admin();
  select count(*) into v_cnt from public.aircraft_members
    where aircraft_id = v_ax and user_id = v_pilot and role = 'pilot';
  assert v_cnt = 1, '(1) PILOT should now be a pilot member of X';

  -- PILOT can SELECT X's session.
  perform pg_temp.act_as(v_pilot);
  select count(*) into v_cnt from public.preflight_sessions where id = v_sx;
  assert v_cnt = 1, '(1) PILOT should see X''s session after joining';

  -- PILOT can LOG to X (insert a session).
  insert into public.preflight_sessions (aircraft_id, input_type, created_by)
    values (v_ax, 'no_issues', v_pilot) returning id into v_sx_pilot;
  assert v_sx_pilot is not null, '(1) PILOT should be able to log to X';

  -- =================================================================
  -- (2) WRONG type / WRONG tail → no join. Idempotent re-join.
  -- =================================================================
  perform pg_temp.act_as(v_pilot);
  select public.join_aircraft_by_tail('N12345', 'Piper') into v_joined;
  assert v_joined is null, '(2) wrong type must NOT match';
  select public.join_aircraft_by_tail('N00000', 'Cessna 172') into v_joined;
  assert v_joined is null, '(2) wrong tail must NOT match';

  -- Idempotent re-join: returns X, no duplicate, role stays 'pilot'.
  select public.join_aircraft_by_tail('N12345', 'Cessna 172') into v_joined;
  assert v_joined = v_ax, '(2) idempotent re-join should still return X';
  perform pg_temp.act_as_admin();
  select count(*) into v_cnt from public.aircraft_members
    where aircraft_id = v_ax and user_id = v_pilot;
  assert v_cnt = 1, '(2) re-join must not create a duplicate membership';

  -- =================================================================
  -- (3) ISOLATION (the critical leak test): joining X grants access to
  --     X ONLY — aircraft Y stays invisible / un-loggable for PILOT.
  -- =================================================================
  perform pg_temp.act_as(v_pilot);
  select count(*) into v_cnt from public.aircraft where id = v_ay;
  assert v_cnt = 0, '(3) LEAK: PILOT must NOT see aircraft Y after joining X';
  select count(*) into v_cnt from public.preflight_sessions where aircraft_id = v_ay;
  assert v_cnt = 0, '(3) LEAK: PILOT must NOT see Y''s sessions';

  begin
    insert into public.preflight_sessions (aircraft_id, input_type, created_by)
      values (v_ay, 'no_issues', v_pilot);
    assert false, '(3) LEAK: PILOT must NOT be able to log to Y';
  exception when others then
    null; -- expected: RLS WITH CHECK violation
  end;

  -- =================================================================
  -- (4) OWNER-OR-CREATOR delete:
  --     (4a) a regular PILOT cannot delete the OWNER's log;
  --     (4b) the OWNER (creator) CAN delete the PILOT's log;
  --     (4c) a PILOT can delete their OWN log.
  -- =================================================================
  -- (4a) PILOT tries to delete OWNER's session v_sx → denied (0 rows).
  perform pg_temp.act_as(v_pilot);
  delete from public.preflight_sessions where id = v_sx;
  perform pg_temp.act_as_admin();
  select count(*) into v_cnt from public.preflight_sessions where id = v_sx;
  assert v_cnt = 1, '(4a) PILOT must NOT delete OWNER''s log';

  -- (4b) OWNER deletes PILOT's session v_sx_pilot → allowed.
  perform pg_temp.act_as(v_owner);
  delete from public.preflight_sessions where id = v_sx_pilot;
  perform pg_temp.act_as_admin();
  select count(*) into v_cnt from public.preflight_sessions where id = v_sx_pilot;
  assert v_cnt = 0, '(4b) OWNER (creator) MUST be able to delete a member''s log';

  -- (4c) PILOT logs again, then deletes their OWN log → allowed.
  perform pg_temp.act_as(v_pilot);
  insert into public.preflight_sessions (aircraft_id, input_type, created_by)
    values (v_ax, 'no_issues', v_pilot) returning id into v_sx_pilot;
  delete from public.preflight_sessions where id = v_sx_pilot;
  perform pg_temp.act_as_admin();
  select count(*) into v_cnt from public.preflight_sessions where id = v_sx_pilot;
  assert v_cnt = 0, '(4c) PILOT MUST be able to delete their OWN log';

  -- =================================================================
  -- (5) Invite-code path still works (not removed/broken).
  -- =================================================================
  perform pg_temp.act_as(v_owner);
  insert into public.aircraft_invites (aircraft_id, code, created_by)
    values (v_ax, 'TESTCODE-OPEN-JOIN-XYZ', v_owner);
  perform pg_temp.act_as(v_stranger);
  select public.redeem_aircraft_invite('TESTCODE-OPEN-JOIN-XYZ') into v_joined;
  assert v_joined = v_ax, '(5) invite-code redeem must still return X';
  perform pg_temp.act_as_admin();
  select count(*) into v_cnt from public.aircraft_members
    where aircraft_id = v_ax and user_id = v_stranger and role = 'pilot';
  assert v_cnt = 1, '(5) invite redeem must still add membership';

  raise notice 'ALL OPEN-JOIN RLS CHECKS PASSED';
end;
$$;

rollback;
