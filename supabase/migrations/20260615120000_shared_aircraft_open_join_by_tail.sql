-- =====================================================================
-- Shared Aircraft — OPEN JOIN BY TAIL + TYPE  (+ owner-can-delete-others)
--
-- ⚠️ FORWARD-ONLY. DO NOT `supabase db push`. APPLY MANUALLY (one
-- transaction) AFTER REVIEW and BEFORE this code deploys. Builds on
-- Phase 1 (aircraft_members, is_aircraft_member; 20260611120000) and
-- Phase 2 (is_aircraft_owner, redeem_aircraft_invite; 20260611130000).
--
-- WHAT THIS ADDS (owner-approved product decision — tail numbers are
-- public, and that is accepted):
--   (A) join_aircraft_by_tail(p_tail, p_type): a SECOND membership-insert
--       path ALONGSIDE the invite code. Any authenticated user who submits
--       a tail number + aircraft type that MATCHES an existing aircraft is
--       added as a 'pilot' member of THAT aircraft only. Mirrors the exact
--       safety shape of redeem_aircraft_invite: it hard-sets
--       user_id = auth.uid() and derives aircraft_id from the validated
--       match, so it can NEVER add another user or join an unmatched
--       aircraft. The invite-code path is untouched.
--   (B) owner-OR-creator DELETE: the aircraft's creator (aircraft.user_id)
--       may delete ANY member's logs on that aircraft; a regular pilot may
--       still delete only their OWN. This REPLACES the Phase-1 creator-only
--       delete policies. It is the ONLY RLS change here — select / insert /
--       update scoping is byte-for-byte unchanged.
--
-- ISOLATION (non-negotiable, unchanged): access is still per-aircraft via
-- is_aircraft_member(<this row's aircraft>). Joining aircraft X inserts a
-- membership row for X ONLY; every select/insert/update/delete policy keys
-- off the row's own aircraft, so X-membership exposes nothing of any other
-- aircraft Y. This migration does NOT touch any select/insert/update
-- policy, so that boundary is preserved exactly.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (A0) Creator helper — "is auth.uid() the aircraft's creator/owner?".
--      Keyed off the CANONICAL aircraft.user_id column (set on every
--      create), not the membership role, so it is correct even for the
--      owner-delete branch regardless of membership-row bookkeeping.
--      SECURITY DEFINER so it bypasses aircraft RLS, but it ONLY ever
--      tests the CURRENT user (auth.uid()) → it cannot read or leak any
--      other user's relationship. Mirrors is_aircraft_member /
--      is_aircraft_owner.
-- ---------------------------------------------------------------------
create or replace function public.is_aircraft_creator(aid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.aircraft a
    where a.id = aid
      and a.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------
-- (A) Open join by tail + type — the second membership-insert path.
--
--     Match rule (signed-off): BOTH tail AND aircraft_type must match an
--     existing aircraft. Tail is normalized identically to the aircraft
--     insert/update trigger (upper + strip ALL whitespace); the stored
--     tail_number is already normalized, and is globally UNIQUE, so at
--     most one row can match. aircraft_type is compared trimmed +
--     case-insensitively. (An aircraft with a NULL/blank type cannot be
--     open-joined — fail-closed; use the invite code for those.)
--
--     SAFETY (identical shape to redeem_aircraft_invite):
--       * user_id is HARD-SET to auth.uid() — never a caller-supplied id.
--       * aircraft_id is DERIVED from the validated tail+type match —
--         never caller-supplied; an unmatched submission returns NULL and
--         inserts nothing.
--       * inserts as 'pilot'; ON CONFLICT DO NOTHING → idempotent re-join,
--         and an owner re-submitting their own tail is a no-op (no role
--         downgrade from 'owner' to 'pilot').
--     Returns the joined aircraft_id, or NULL (no match / unauthenticated)
--     which the caller maps to a uniform "No matching aircraft found".
-- ---------------------------------------------------------------------
create or replace function public.join_aircraft_by_tail(p_tail text, p_type text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_norm_tail text;
  v_aircraft  uuid;
begin
  if v_uid is null then
    return null;
  end if;

  -- Normalize the submitted tail like normalize_tail_number() does.
  v_norm_tail := upper(regexp_replace(coalesce(p_tail, ''), '\s+', '', 'g'));

  -- Both fields are required for a match (small barrier vs. wrong-plane
  -- joins; not a security control — tails are public).
  if v_norm_tail = '' or coalesce(btrim(p_type), '') = '' then
    return null;
  end if;

  -- Derive the aircraft from the match ONLY. tail_number is unique, so
  -- this is at most one row.
  select id
    into v_aircraft
    from public.aircraft
   where tail_number = v_norm_tail
     and lower(btrim(aircraft_type)) = lower(btrim(p_type))
   limit 1;

  if v_aircraft is null then
    return null;
  end if;

  -- Add ONLY the caller, as 'pilot', to ONLY the matched aircraft.
  insert into public.aircraft_members (aircraft_id, user_id, role)
  values (v_aircraft, v_uid, 'pilot')
  on conflict (aircraft_id, user_id) do nothing;

  return v_aircraft;
end;
$$;

grant execute on function public.join_aircraft_by_tail(text, text) to authenticated;

-- =====================================================================
-- (B) OWNER-OR-CREATOR DELETE — the ONLY RLS change.
--
-- Replaces the Phase-1 *_delete_creator policies with *_delete_owner_or_creator:
--   allowed iff the row is on an aircraft the caller is a member of AND
--   ( the caller created the row  OR  the caller is the aircraft's creator ).
-- A regular pilot → only their own (created_by = auth.uid()). The aircraft
-- creator → any member's log on their aircraft. select/insert/update are
-- NOT touched. The creator check uses the row's OWN aircraft, so it grants
-- nothing on any other aircraft.
-- =====================================================================

-- ----- preflight_sessions -------------------------------------------
drop policy "sessions_delete_creator" on public.preflight_sessions;
create policy "sessions_delete_owner_or_creator" on public.preflight_sessions
  for delete to authenticated
  using (
    public.is_aircraft_member(aircraft_id)
    and (
      created_by = auth.uid()
      or public.is_aircraft_creator(aircraft_id)
    )
  );

-- ----- issues --------------------------------------------------------
drop policy "issues_delete_creator" on public.issues;
create policy "issues_delete_owner_or_creator" on public.issues
  for delete to authenticated
  using (
    public.is_aircraft_member(aircraft_id)
    and (
      created_by = auth.uid()
      or public.is_aircraft_creator(aircraft_id)
    )
  );

-- ----- issue_observations (via issue) -------------------------------
drop policy "issue_obs_delete_creator" on public.issue_observations;
create policy "issue_obs_delete_owner_or_creator" on public.issue_observations
  for delete to authenticated
  using (
    exists (
      select 1 from public.issues i
      where i.id = issue_observations.issue_id
        and public.is_aircraft_member(i.aircraft_id)
        and (
          issue_observations.created_by = auth.uid()
          or public.is_aircraft_creator(i.aircraft_id)
        )
    )
  );

-- ----- media_assets (session-linked OR checklist aircraft-linked) ---
-- The creator check uses the row's OWN aircraft in each shape:
--   session-linked  → the session's aircraft_id
--   checklist-linked→ media_assets.aircraft_id
drop policy "media_delete_creator" on public.media_assets;
create policy "media_delete_owner_or_creator" on public.media_assets
  for delete to authenticated
  using (
    (preflight_session_id is not null and exists (
      select 1 from public.preflight_sessions s
      where s.id = media_assets.preflight_session_id
        and public.is_aircraft_member(s.aircraft_id)
        and (
          media_assets.created_by = auth.uid()
          or public.is_aircraft_creator(s.aircraft_id)
        )
    ))
    or (aircraft_id is not null
        and public.is_aircraft_member(aircraft_id)
        and (
          created_by = auth.uid()
          or public.is_aircraft_creator(aircraft_id)
        ))
  );

-- ----- voice_transcriptions (via session; no created_by of its own) --
-- Author = the parent session's creator. Owner-or-creator gate via that
-- session.
drop policy "voice_tx_delete_creator" on public.voice_transcriptions;
create policy "voice_tx_delete_owner_or_creator" on public.voice_transcriptions
  for delete to authenticated
  using (
    exists (
      select 1 from public.preflight_sessions s
      where s.id = voice_transcriptions.preflight_session_id
        and public.is_aircraft_member(s.aircraft_id)
        and (
          s.created_by = auth.uid()
          or public.is_aircraft_creator(s.aircraft_id)
        )
    )
  );

-- =====================================================================
-- ROLLBACK (run as a NEW forward migration if ever needed):
--   -- restore creator-only delete (verbatim from Phase 1):
--   drop policy "sessions_delete_owner_or_creator"   on public.preflight_sessions;
--   drop policy "issues_delete_owner_or_creator"     on public.issues;
--   drop policy "issue_obs_delete_owner_or_creator"  on public.issue_observations;
--   drop policy "media_delete_owner_or_creator"      on public.media_assets;
--   drop policy "voice_tx_delete_owner_or_creator"   on public.voice_transcriptions;
--   -- ...then re-create the *_delete_creator policies as in
--   -- 20260611120000_shared_aircraft_phase1_membership_rls.sql.
--   revoke execute on function public.join_aircraft_by_tail(text, text) from authenticated;
--   drop function if exists public.join_aircraft_by_tail(text, text);
--   drop function if exists public.is_aircraft_creator(uuid);
-- Membership rows already created by open join are intentionally KEPT.
-- =====================================================================
