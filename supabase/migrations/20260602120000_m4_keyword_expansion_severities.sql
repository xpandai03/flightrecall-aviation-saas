-- =====================================================================
-- M4 Item 2 — keyword expansion: new issue types + severity reclassifications
--
-- Companion to lib/issue-extraction.ts (ISSUE_KEYWORDS) and
-- lib/issue-taxonomy.ts (SEVERITY_MAP). Severity is type-level only:
-- issues resolve severity via JOIN to issue_types (no severity_class on
-- issues), so each UPDATE/INSERT below reclassifies ALL existing AND
-- future issues of that type. This is the intended safest-when-ambiguous
-- choice (critical over monitor) — Raunek/Zach signed off.
--
-- SYNC RULE: every severity here MUST match SEVERITY_MAP in
-- lib/issue-taxonomy.ts. TS-only or migration-only is a desync defect.
--
-- Mirrors the tire_worn reclassify template
-- (20260601120000_reclassify_tire_worn_critical.sql). Forward-only.
-- Applied manually after review — NOT via `supabase db push`.
--
-- Reversible: re-run the UPDATEs with 'cosmetic' to revert severities;
-- delete the four new issue_types (guard on no referencing issues) to
-- revert the new types.
-- =====================================================================

-- (1) New generic-critical issue types -------------------------------
-- Introduced instead of flipping the cosmetic catch-all "other" to
-- critical, which would contradict the signed-off broken/torn = monitor
-- decisions (both map to "other"). Categories use the existing set
-- (engine_oil | structural | landing_gear | fuel | electrical |
--  flight_controls | general_safety).
insert into public.issue_types (slug, name, category, severity_class) values
  ('leak_general', 'General Leak', 'general_safety', 'critical'),
  ('not_working',  'Not Working',  'general_safety', 'critical'),
  ('damage',       'Damage',       'structural',     'critical'),
  ('hole',         'Hole',         'structural',     'critical')
on conflict (slug) do update set
  name           = excluded.name,
  category       = excluded.category,
  severity_class = excluded.severity_class;

-- (2) Severity reclassifications: cosmetic → critical ----------------
-- ⚠️ Each affects ALL existing reports of that type, not just new
-- keyword matches.
--   loose_panel — a loose control/fastener is critical (bare "loose").
--   flicker     — a flickering instrument/avionics indicator is critical.
--   tire_low    — low tire pressure is a dispatch item ("low pressure").
update public.issue_types
   set severity_class = 'critical'
 where slug in ('loose_panel', 'flicker', 'tire_low');

-- crack is already 'critical' (20260514120000) — no change; listed here
-- only to document the signed-off "crack → ALWAYS critical" decision.
