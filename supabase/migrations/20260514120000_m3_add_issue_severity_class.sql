-- =====================================================================
-- M3 Item 1 — issue_types.severity_class (critical vs cosmetic)
--
-- Reference taxonomy: supabase/migrations/20260505200000_m5_issue_taxonomy_expansion.sql
-- (adds category + V1 slugs). Legacy five seeds: 0003_m3_schema.sql. Compound slugs
-- oil_on_belly / oil_on_engine removed in 20260506000000_m5_remove_compound_slugs.sql.
--
-- Severity is type-level only: issues resolve severity via JOIN to issue_types
-- (no severity_class column on issues). Forward-only — do not edit prior migrations.
-- =====================================================================

alter table public.issue_types
  add column if not exists severity_class text;

-- 23 critical (V1 taxonomy + legacy oil)
update public.issue_types
   set severity_class = 'critical'
 where slug in (
       'binding',
       'brake_soft',
       'brake_wear',
       'cable_issue',
       'cap_loose',
       'corrosion',
       'crack',
       'flat_tire',
       'fuel_contamination',
       'fuel_leak',
       'fuel_smell',
       'low_voltage',
       'missing_fastener',
       'oil',
       'oil_dirty',
       'oil_leak',
       'oil_low',
       'rough_engine',
       'stiff_control',
       'unusual_noise',
       'unusual_resistance',
       'vibration',
       'battery_weak'
     );

-- 10 cosmetic (V1 taxonomy + legacy tire quick-tag)
update public.issue_types
   set severity_class = 'cosmetic'
 where slug in (
       'avionics_reset',
       'dent',
       'flicker',
       'loose_panel',
       'other',
       'scratch',
       'something_off',
       'tire',
       'tire_low',
       'tire_worn'
     );

alter table public.issue_types
  alter column severity_class set not null;

alter table public.issue_types
  add constraint issue_types_severity_class_check
  check (severity_class in ('critical', 'cosmetic'));
