-- =====================================================================
-- M4 #2 — Wipe existing pre-auth data
--
-- Clean slate before RLS goes on in migration #3. Runs as the postgres
-- role (the role `supabase db push` uses), which BYPASSES RLS — so we
-- can freely TRUNCATE while M3's anon grants are still in place.
--
-- issue_types is preserved (it's reference data; the 5 seed rows from
-- 0003 stay).
--
-- Storage objects: Supabase blocks direct DELETE from storage.objects
-- via SQL ("Direct deletion from storage tables is not allowed. Use the
-- Storage API instead.", SQLSTATE 42501). Bucket cleanup happens via
-- the dashboard's "Empty bucket" action — which uses the Storage API
-- and tombstones each blob properly. We do NOT attempt a SQL delete
-- here.
-- =====================================================================

truncate table
  public.issue_observations,
  public.voice_transcriptions,
  public.media_assets,
  public.preflight_sessions,
  public.issues,
  public.aircraft
  cascade;
