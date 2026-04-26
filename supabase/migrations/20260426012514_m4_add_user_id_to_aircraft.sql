-- =====================================================================
-- M4 #1 — Schema add: aircraft.user_id (+ aircraft_type free-text col)
-- Migration #2 wipes the table; migration #3 sets user_id NOT NULL.
-- Existing make / model / year columns are kept untouched (V1 forms
-- don't use them, but the schema stays for future structured profiles).
-- =====================================================================

alter table public.aircraft
  add column user_id       uuid references auth.users(id) on delete cascade,
  add column aircraft_type text;

create index idx_aircraft_user_id on public.aircraft(user_id);
