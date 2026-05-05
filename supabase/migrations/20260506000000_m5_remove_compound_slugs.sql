-- =====================================================================
-- M5 #2 corrective patch — remove unused compound issue type slugs
--
-- Phase 2 seeded oil_on_belly / oil_on_engine as compound (issue +
-- location) slugs. Real-world iPhone Safari Whisper output included
-- filler words ("oil on the belly") that the compound substring
-- match could not tolerate, producing a false-negative in keyword
-- extraction. The lib/issue-extraction.ts decompose now handles the
-- same content as base oil_leak + Fuselage/Engine Area via the
-- location pairer, so the compound slugs are dead weight.
--
-- Forward-only. Guarded delete: if any issues row references either
-- slug, the FK constraint would fail anyway — the `not exists` clause
-- turns that failure mode into a silent no-op so the migration is
-- safe to apply even if production state surprises us. Production was
-- verified zero-referencing before this migration was authored.
--
-- Down-migration sketch (commented; not expected to run):
--   insert into public.issue_types (slug, name, category) values
--     ('oil_on_belly',  'Oil on Belly',  'engine_oil'),
--     ('oil_on_engine', 'Oil on Engine', 'engine_oil')
--   on conflict (slug) do nothing;
-- =====================================================================

delete from public.issue_types
 where slug in ('oil_on_belly', 'oil_on_engine')
   and not exists (
     select 1 from public.issues
      where issues.issue_type_id = issue_types.id
   );
