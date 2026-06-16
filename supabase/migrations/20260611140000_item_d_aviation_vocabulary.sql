-- =====================================================================
-- Item D — aviation vocabulary: new issue types for the client-enumerated
-- failure verbs (blocked / glitching / out / no-transmit / static / …).
--
-- ⚠️ FORWARD-ONLY. DO NOT `supabase db push`. APPLY MANUALLY AFTER REVIEW
-- and BEFORE the Item-D code deploys. Mirrors the Item-2 template
-- (20260602120000_m4_keyword_expansion_severities.sql).
--
-- ⚠️ MUST be applied or the new types extract-then-VANISH: persistOne looks
-- up issue_types by slug and silently drops unknown slugs
-- (lib/transcription-job.ts) — audit finding #1. So "pitot tube blocked",
-- "altimeter glitching", "navigation light is out", "GPS no transmit" would
-- produce nothing in prod until this lands.
--
-- SYNC RULE: every severity here MUST match SEVERITY_MAP in
-- lib/issue-taxonomy.ts. All four are CRITICAL (bias = critical when
-- ambiguous; a blocked pitot, an unreliable instrument, comm loss, or a
-- nav/landing light out are all safety-relevant).
--
-- Reversible: delete the four issue_types (guard on no referencing issues).
-- =====================================================================

insert into public.issue_types (slug, name, category, severity_class) values
  ('obstruction',      'Obstruction',      'general_safety', 'critical'),  -- blocked, obstructed
  ('instrument_fault', 'Instrument Fault', 'electrical',     'critical'),  -- glitching, frozen, inaccurate, intermittent, not responding
  ('comm_fault',       'Comm Fault',       'electrical',     'critical'),  -- no transmit, no receive, radio static
  ('equipment_out',    'Equipment Out',    'electrical',     'critical')   -- out (light/equipment, location-gated)
on conflict (slug) do update set
  name           = excluded.name,
  category       = excluded.category,
  severity_class = excluded.severity_class;
