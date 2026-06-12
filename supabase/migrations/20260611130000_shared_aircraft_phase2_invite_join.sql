-- =====================================================================
-- Shared Aircraft — PHASE 2: invite-code join
--
-- ⚠️ FORWARD-ONLY. DO NOT `supabase db push`. APPLY MANUALLY AFTER REVIEW
-- and BEFORE the Phase 2 application code deploys. Builds on Phase 1
-- (aircraft_members, is_aircraft_member; 20260611120000).
--
-- Join model = INVITE CODE ONLY (signed-off). The public tail number
-- NEVER grants access. A secret, high-entropy code (minted by the app via
-- crypto, stored here) is the only way to join. Owners mint/regenerate/
-- revoke codes; a second pilot redeems a valid code to become a 'pilot'
-- member.
--
-- SAFETY MODEL (the leak boundary):
--   * aircraft_members got NO insert grant/policy for `authenticated` in
--     Phase 1 and gets none here. So a user CANNOT self-insert membership.
--   * The ONLY way a membership row is created post-backfill is
--     redeem_aircraft_invite() — a SECURITY DEFINER function that hard-codes
--     user_id = auth.uid() and aircraft_id = the code's aircraft. It is
--     therefore impossible to add an arbitrary user, or to join an
--     arbitrary aircraft, or to join by tail number.
--   * aircraft_invites RLS is OWNER-ONLY; pilots/non-members cannot read or
--     mint codes. The redeemer never reads the invite row (the SECURITY
--     DEFINER function looks it up internally and returns only the
--     aircraft_id).
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) Owner helper (mirrors is_aircraft_member, but role = 'owner').
--     Tests only the CURRENT user's owner-membership of the passed
--     aircraft — cannot read others' rows.
-- ---------------------------------------------------------------------
create or replace function public.is_aircraft_owner(aid uuid)
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
      and m.role = 'owner'
  );
$$;

-- ---------------------------------------------------------------------
-- (2) Invite table. The code is minted by the app (crypto, url-safe,
--     high-entropy) and stored unique. revoked_at / expires_at gate
--     validity. At most one ACTIVE (un-revoked) invite per aircraft.
-- ---------------------------------------------------------------------
create table public.aircraft_invites (
  id          uuid primary key default gen_random_uuid(),
  aircraft_id uuid not null references public.aircraft(id) on delete cascade,
  code        text not null unique,
  created_by  uuid not null references auth.users(id),
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  expires_at  timestamptz
);
create index idx_aircraft_invites_aircraft on public.aircraft_invites(aircraft_id);
-- One active code per aircraft (regenerate = revoke old, insert new).
create unique index uq_aircraft_invites_one_active
  on public.aircraft_invites(aircraft_id)
  where revoked_at is null;

grant select, insert, update on public.aircraft_invites to authenticated;
alter table public.aircraft_invites enable row level security;

-- RLS: OWNER-ONLY. Only the aircraft's owner can read/mint/revoke its
-- codes. No select for pilots or non-members. No delete policy (revoke =
-- update revoked_at). Redemption does NOT go through these policies — it
-- uses the SECURITY DEFINER function in (3).
create policy "invites_select_owner" on public.aircraft_invites
  for select to authenticated
  using (public.is_aircraft_owner(aircraft_id));

create policy "invites_insert_owner" on public.aircraft_invites
  for insert to authenticated
  with check (public.is_aircraft_owner(aircraft_id) and created_by = auth.uid());

create policy "invites_update_owner" on public.aircraft_invites
  for update to authenticated
  using (public.is_aircraft_owner(aircraft_id))
  with check (public.is_aircraft_owner(aircraft_id));

-- ---------------------------------------------------------------------
-- (3) Redemption — the ONLY membership-insert path for `authenticated`.
--     SECURITY DEFINER so it can validate the code (bypassing the
--     owner-only invite RLS) and insert membership (aircraft_members has
--     no authenticated insert grant). It forces user_id = auth.uid() and
--     aircraft_id = the validated code's aircraft, so it can never add
--     someone else or join an unrelated aircraft.
--
--     Returns: the joined aircraft_id on success (incl. idempotent
--     re-redeem), or NULL when the code is unknown/revoked/expired or the
--     caller is unauthenticated. The caller maps NULL → a uniform,
--     non-enumerable "invalid or expired code" error.
-- ---------------------------------------------------------------------
create or replace function public.redeem_aircraft_invite(invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_aircraft uuid;
begin
  if v_uid is null then
    return null;
  end if;

  -- Validate the code: must exist, not revoked, not expired.
  select aircraft_id
    into v_aircraft
    from public.aircraft_invites
   where code = invite_code
     and revoked_at is null
     and (expires_at is null or expires_at > now())
   limit 1;

  if v_aircraft is null then
    return null;
  end if;

  -- Add ONLY the redeemer (auth.uid()), as 'pilot', to ONLY this
  -- aircraft. Idempotent: already-a-member (incl. the owner redeeming
  -- their own code) is a no-op success, no role downgrade.
  insert into public.aircraft_members (aircraft_id, user_id, role)
  values (v_aircraft, v_uid, 'pilot')
  on conflict (aircraft_id, user_id) do nothing;

  return v_aircraft;
end;
$$;

grant execute on function public.redeem_aircraft_invite(text) to authenticated;

-- =====================================================================
-- ROLLBACK (new forward migration if ever needed):
--   revoke execute on function public.redeem_aircraft_invite(text) from authenticated;
--   drop function if exists public.redeem_aircraft_invite(text);
--   drop table if exists public.aircraft_invites;   -- cascades its policies/indexes
--   drop function if exists public.is_aircraft_owner(uuid);
-- Membership rows already created by redemption are intentionally KEPT
-- (D6 — leaving/teardown keeps logs+membership); drop them manually only
-- if you intend to un-share.
-- =====================================================================
