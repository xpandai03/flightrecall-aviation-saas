-- =====================================================================
-- M5 #2 — Issue taxonomy expansion + location-aware issues
--
-- Phase 2 of M2 punch-list. Replaces the 5-slug photo-quick-tag
-- taxonomy with the full V1 keyword-detection taxonomy (~30 types
-- across 7 categories), adds location to issues so "oil on belly"
-- and "oil on engine" coexist, and adds raw_transcript + summary
-- to observations so each session's evidence is preserved.
--
-- Forward-only. Preview DB is empty post-M4-wipe; if real production
-- data exists at apply time, the legacy 5 slugs are preserved (insert
-- ON CONFLICT below is non-destructive, alter table … add column is
-- nullable).
--
-- Down-migration sketch (commented; not expected to run):
--   alter table public.issue_observations drop column raw_transcript;
--   alter table public.issue_observations drop column summary;
--   alter table public.issues drop constraint issues_unique_per_location;
--   alter table public.issues
--     add constraint issues_aircraft_id_issue_type_id_key
--     unique (aircraft_id, issue_type_id);
--   alter table public.issues drop column location;
--   alter table public.issue_types drop column category;
--   delete from public.issue_types where slug not in
--     ('scratch','dent','tire','oil','other');
-- =====================================================================

-- (a) Add `category` column to issue_types ----------------------------
alter table public.issue_types
  add column if not exists category text;

-- (b) Backfill category for the 5 legacy seeds (run BEFORE inserts so
--     no row gets re-touched by the ON CONFLICT path below). The
--     original 5 slugs survive — Phase 2 does not deprecate the legacy
--     photo-quick-tag flow.
update public.issue_types set category = 'structural'
  where slug in ('scratch', 'dent', 'other');
update public.issue_types set category = 'landing_gear'
  where slug = 'tire';
update public.issue_types set category = 'engine_oil'
  where slug = 'oil';

-- (c) Insert the V1 spec taxonomy (idempotent via ON CONFLICT) --------
insert into public.issue_types (slug, name, category) values
  -- ENGINE/OIL
  ('oil_leak',          'Oil Leak',           'engine_oil'),
  ('oil_on_belly',      'Oil on Belly',       'engine_oil'),
  ('oil_on_engine',     'Oil on Engine',      'engine_oil'),
  ('oil_low',           'Oil Low',            'engine_oil'),
  ('oil_dirty',         'Oil Dirty',          'engine_oil'),
  -- STRUCTURAL
  ('crack',             'Crack',              'structural'),
  ('corrosion',         'Corrosion',          'structural'),
  ('loose_panel',       'Loose Panel',        'structural'),
  ('missing_fastener',  'Missing Fastener',   'structural'),
  -- LANDING GEAR / TIRES
  ('tire_low',          'Tire Low',           'landing_gear'),
  ('tire_worn',         'Tire Worn',          'landing_gear'),
  ('flat_tire',         'Flat Tire',          'landing_gear'),
  ('brake_wear',        'Brake Wear',         'landing_gear'),
  ('brake_soft',        'Brake Soft',         'landing_gear'),
  -- FUEL
  ('fuel_leak',         'Fuel Leak',          'fuel'),
  ('fuel_smell',        'Fuel Smell',         'fuel'),
  ('cap_loose',         'Fuel Cap Loose',     'fuel'),
  ('fuel_contamination','Fuel Contamination', 'fuel'),
  -- ELECTRICAL
  ('flicker',           'Electrical Flicker', 'electrical'),
  ('avionics_reset',    'Avionics Reset',     'electrical'),
  ('low_voltage',       'Low Voltage',        'electrical'),
  ('battery_weak',      'Battery Weak',       'electrical'),
  -- FLIGHT CONTROLS
  ('stiff_control',     'Stiff Control',      'flight_controls'),
  ('unusual_resistance','Unusual Resistance', 'flight_controls'),
  ('cable_issue',       'Cable Issue',        'flight_controls'),
  ('binding',           'Binding',            'flight_controls'),
  -- GENERAL/SAFETY
  ('vibration',         'Vibration',          'general_safety'),
  ('unusual_noise',     'Unusual Noise',      'general_safety'),
  ('rough_engine',      'Rough Engine',       'general_safety'),
  ('something_off',     'Something Feels Off','general_safety')
on conflict (slug) do update set
  name     = excluded.name,
  category = excluded.category;

-- (d) Add `location` to issues ---------------------------------------
alter table public.issues
  add column if not exists location text;

-- (e) Replace the unique constraint ----------------------------------
-- Old: UNIQUE (aircraft_id, issue_type_id)
-- New: UNIQUE (aircraft_id, issue_type_id, location)
--
-- Postgres treats NULLs as distinct in unique constraints by default.
-- That means legacy quick_tag uploads (location IS NULL) could create
-- duplicate rows for the same (aircraft, type) pair. We intentionally
-- DO NOT use a COALESCE-based partial index — instead, the legacy
-- upsertIssueForMedia in app/api/v1/media/[id]/complete/route.ts is
-- patched in the next commit to add `.is("location", null)` in its
-- existence check. Same dedupe effect, simpler index, no perf cost.
alter table public.issues
  drop constraint if exists issues_aircraft_id_issue_type_id_key;

alter table public.issues
  drop constraint if exists issues_unique_per_location;

alter table public.issues
  add constraint issues_unique_per_location
    unique (aircraft_id, issue_type_id, location);

-- (f) Add evidence fields to observations ----------------------------
-- raw_transcript: the verbatim transcript text from which this
--                 observation was extracted (max 500 chars stored).
-- summary:        the human-readable phrase formatted at extraction
--                 time, e.g. "Oil observed on belly".
alter table public.issue_observations
  add column if not exists raw_transcript text,
  add column if not exists summary text;
