-- =====================================================================
-- Reclassify tire_worn severity: cosmetic → critical
--
-- A worn tire is a genuine safety risk (can fail on takeoff/landing), so
-- it must surface in the dashboard Active Issues (critical) bucket rather
-- than the cosmetic bucket.
--
-- Severity is type-level only: issues resolve severity via JOIN to
-- issue_types (no severity_class column on issues). This single UPDATE
-- therefore reclassifies all existing AND future tire_worn issues.
-- Mirrors SEVERITY_MAP in lib/issue-taxonomy.ts. Forward-only.
--
-- Reversible: re-run with severity_class = 'cosmetic' to revert.
-- =====================================================================

update public.issue_types
   set severity_class = 'critical'
 where slug = 'tire_worn';
