-- =====================================================================
-- M4 #4 — Storage policies: lockdown anon, scope storage.objects to
-- the authenticated user's path prefix.
--
-- New path convention (enforced by application code in
-- app/api/v1/media/upload-url/route.ts):
--
--   users/<auth.uid()>/aircraft/<aircraft_id>/sessions/<session_id>/
--     <media_type>/<asset_id>-<sanitized_filename>
--
-- storage.foldername(name) splits on '/', so:
--   [1] = 'users'
--   [2] = auth.uid() as text
--   [3] = 'aircraft'
--   [4] = aircraft_id
--   ...
--
-- The simplest reliable RLS check is `(storage.foldername(name))[2] =
-- auth.uid()::text`. Combined with a bucket_id filter, this gives
-- per-user isolation without any join through public tables.
-- =====================================================================

-- Drop the M1 anon policies on storage.objects + storage.buckets ------
drop policy if exists "m1_anon_upload_flight_recall_media"      on storage.objects;
drop policy if exists "m1_anon_read_flight_recall_media"        on storage.objects;
drop policy if exists "m1_anon_update_flight_recall_media"      on storage.objects;
drop policy if exists "m1_anon_read_flight_recall_media_bucket" on storage.buckets;

-- Revoke the broad anon SELECT on storage.buckets (M1 debt #5) --------
revoke select on storage.buckets from anon;

-- Bucket visibility for the authenticated user (needed by signed-URL
-- minting, list-objects, and createSignedUploadUrl to resolve the
-- bucket name).
create policy "auth_users_see_flight_recall_bucket"
  on storage.buckets for select to authenticated
  using (id = 'flight-recall-media');

-- READ own files
create policy "users_read_own_media"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'flight-recall-media'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- INSERT to own path (signed-upload-url minting + direct upload both
-- produce an INSERT into storage.objects).
create policy "users_upload_own_media"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'flight-recall-media'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- UPDATE metadata on own files (used by upsert flows + checksum
-- updates during PUT).
create policy "users_update_own_media"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'flight-recall-media'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- DELETE own files (no UI in M4, but the policy is free and matches
-- a well-formed access model so we don't have to come back later).
create policy "users_delete_own_media"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'flight-recall-media'
    and (storage.foldername(name))[2] = auth.uid()::text
  );
