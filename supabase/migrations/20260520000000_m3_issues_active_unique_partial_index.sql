-- =====================================================================
-- M3 Release Fix (Bug #3) — partial active-only unique index for issues
--
-- Replaces the all-rows unique constraint issues_unique_per_location
-- (aircraft_id, issue_type_id, location) with a PARTIAL unique index
-- that covers only current_status = 'active' rows.
--
-- Why: a resolved issue and a brand-new active issue of the same
-- type+location must be able to coexist. The old all-rows constraint
-- forced the extraction / quick-tag upsert code to UPDATE (and thereby
-- silently re-activate) a resolved row instead of inserting a fresh
-- one — the "issue resurrection" release blocker.
--
-- Reference: issues_unique_per_location was added in
-- 20260505200000_m5_issue_taxonomy_expansion.sql section (e).
--
-- Forward-only. No down migration — revert via a new migration if ever
-- required:
--   drop index if exists public.issues_active_unique;
--   alter table public.issues
--     add constraint issues_unique_per_location
--     unique (aircraft_id, issue_type_id, location);
--
-- NULL semantics unchanged: Postgres treats NULL `location` as DISTINCT
-- in unique indexes (exactly as the dropped constraint did). Legacy
-- photo-quick-tag rows carry location = NULL; their single-active-row
-- invariant is upheld in application code (the active-only issue
-- lookup in persistOne / upsertIssueForMedia), not by this index.
--
-- PRE-CHECK — run this manually in the SQL editor BEFORE applying. If
-- it returns any row, two active issues already share a key and the
-- CREATE UNIQUE INDEX below will fail; resolve those duplicates first:
--
--   select aircraft_id, issue_type_id, location, count(*)
--   from public.issues
--   where current_status = 'active'
--   group by aircraft_id, issue_type_id, location
--   having count(*) > 1;
--
-- Rollback safety: applied via `supabase db push` this migration runs
-- in a single transaction. If CREATE UNIQUE INDEX fails on pre-existing
-- duplicate active rows, the DROP CONSTRAINT rolls back with it and the
-- database is left untouched.
-- =====================================================================

alter table public.issues
  drop constraint if exists issues_unique_per_location;

create unique index if not exists issues_active_unique
  on public.issues (aircraft_id, issue_type_id, location)
  where current_status = 'active';
