# M4 — Auth, Multi-Tenancy, Aircraft Picker

**Owner:** senior FS engineer
**Milestone:** M4 — turn the single-tenant anon prototype into an authenticated multi-pilot product
**Date:** 2026-04-26
**Predecessors:** M1, M2, M2 bug-fix, M3, two UX tweaks. All live at `https://flightrecall-aviation-saas.vercel.app`.
**M4 closes:** debts 1–5 from `docs/plans/m1-supabase-integration.md` consolidated debt section. Defers debt 7 (`media_assets.quick_tag` drop) to M5. Debt 6 is informational.

---

## Objective recap

A new pilot:
1. Lands on the live URL → sees Sign in / Sign up
2. Signs up via email/password OR Google OAuth
3. Lands on "Add your first aircraft" (tail number + optional type)
4. After save, lands on `/aircraft/<id>/dashboard`
5. Runs the full M1+M2+M3 flow under their own auth context
6. Adds a second aircraft via the picker, switches to it
7. Sees only their own data, ever

A second pilot signs up in a different browser → sees zero data leakage.

---

## 1. Files to CREATE

### Migrations (via `supabase migration new <name>`)

| Path | Purpose |
|---|---|
| `supabase/migrations/<ts>_m4_add_user_id_to_aircraft.sql` | `alter table public.aircraft add column user_id uuid references auth.users(id) on delete cascade` (nullable initially; flipped to NOT NULL after wipe) |
| `supabase/migrations/<ts>_m4_wipe_existing_data.sql` | TRUNCATE the six user-data tables CASCADE; DELETE from `storage.objects` for the bucket; instructions to also empty bucket via dashboard for the underlying blobs |
| `supabase/migrations/<ts>_m4_lockdown_and_enable_rls.sql` | NOT NULL on `aircraft.user_id`; revoke anon grants on the seven tables; drop the M1 `m1_anon_*` policies; enable RLS on all seven; create the auth-scoped policy set documented in §3 |
| `supabase/migrations/<ts>_m4_storage_auth_policies.sql` | drop the four `m1_anon_*` storage policies; revoke anon SELECT on storage.buckets; create authenticated SELECT/INSERT/UPDATE/DELETE policies on `storage.objects` matched by path prefix `users/<auth.uid()>/...`; create authenticated SELECT on `storage.buckets` for the bucket id |

### Auth surface

| Path | Purpose |
|---|---|
| `middleware.ts` | root-level middleware that calls `updateSession()` to refresh the Supabase session cookie on every request, redirects unauthenticated users hitting protected pages to `/login?next=...`, leaves API routes to handle their own 401s |
| `utils/supabase/middleware.ts` | extend the existing canonical helper with an `updateSession(request)` wrapper that does the session refresh + redirect logic. Keeps the existing `createClient(request)` export intact |
| `app/login/page.tsx` | login form (email/password + Google button) |
| `app/signup/page.tsx` | signup form (email/password + Google button) |
| `app/auth/callback/route.ts` | OAuth + email-confirm callback — exchanges code for session, then redirects to `/` |
| `app/auth/logout/route.ts` | server route handler — `supabase.auth.signOut()` + redirect to `/login` |
| `components/auth/login-form.tsx` | client component — the login form itself, used by `/login` |
| `components/auth/signup-form.tsx` | client — the signup form |
| `components/auth/sign-out-button.tsx` | client — wraps the logout route handler |

### Aircraft picker + onboarding

| Path | Purpose |
|---|---|
| `app/onboarding/add-aircraft/page.tsx` | first-aircraft screen for newly-signed-up users with zero aircraft |
| `app/(app)/aircraft/[id]/layout.tsx` | aircraft-scoped server-component layout — validates the id belongs to the authed user (RLS catches it; we just check the SELECT returns a row), 404s otherwise. Sets a `last_aircraft_id` cookie so root `/` knows where to redirect next time |
| `app/(app)/aircraft/[id]/dashboard/page.tsx` | the dashboard, scoped to this aircraft (moved from `app/(app)/page.tsx`) |
| `app/(app)/aircraft/[id]/sessions/page.tsx` | sessions list, scoped (moved from `app/(app)/sessions/page.tsx`) |
| `app/(app)/aircraft/[id]/memory/page.tsx` | memory tabs, scoped (moved from `app/(app)/memory/page.tsx`) |
| `components/aircraft/aircraft-picker.tsx` | client — dropdown menu with the user's aircraft list + "+ Add aircraft" entry; emits navigations to `/aircraft/<id>/dashboard` |
| `components/aircraft/add-aircraft-form.tsx` | shared form (used by `/onboarding/add-aircraft` AND the picker's modal): tail number input + optional aircraft_type input + Save |
| `components/aircraft/add-aircraft-dialog.tsx` | dialog wrapper around the add-aircraft form for the in-app picker |
| `lib/api/aircraft.ts` | client fetch wrappers — `listMyAircraft()`, `createAircraft({tail_number, aircraft_type})`, `useAircraftList()` hook |

### API additions

| Path | Purpose |
|---|---|
| `app/api/v1/aircraft/route.ts` | extend with `POST` — creates an aircraft row with `user_id = auth.uid()`. RLS enforces. zod-validated body |
| `app/api/v1/auth/me/route.ts` | `GET` — convenience endpoint returning the current user (id + email). Used by header to decide what to render |

## 2. Files to MODIFY

| Path | Change |
|---|---|
| `app/page.tsx` (new — currently doesn't exist as a top-level page outside `(app)`) | replace the `(app)` group with a smart-redirect page: if no session → `/login`; if session but zero aircraft → `/onboarding/add-aircraft`; if session + aircraft → `/aircraft/<lastUsed-or-first>/dashboard` |
| `app/layout.tsx` | unchanged structurally — still mounts `<Toaster />` + `<Analytics />`. Drops the M2-era "Flight Memory" branding leftovers if any remain |
| `app/(app)/layout.tsx` | becomes auth-aware: server component, fetches the user + their aircraft list, hands the list down to `<TopNav>`. Redirects to `/login` if no user (defensive — middleware should catch first). Removes the `aircraft` route prefix because layouts don't see params; the `[id]` layout handles aircraft-specific scoping |
| `components/top-nav.tsx` | adds `<AircraftPicker>` between the brand and the link nav, plus a user menu (avatar/email + Sign out) on the right. Strips the legacy "Flight Memory" brand string in favor of "Flight Recall" |
| `app/api/v1/aircraft/route.ts` (existing GET) | now returns only the authed user's aircraft (RLS handles); explicit 401 when no session for cleaner DX |
| `app/api/v1/aircraft/[id]/status/route.ts` | RLS handles ownership; add 401 on no session |
| `app/api/v1/aircraft/[id]/active-issues/route.ts` | same |
| `app/api/v1/aircraft/[id]/issues/route.ts` | same |
| `app/api/v1/preflight-sessions/route.ts` (POST + GET) | RLS handles; add 401 |
| `app/api/v1/preflight-sessions/[id]/route.ts` (GET) | same; signed URL minting still works because the authenticated server client owns the session |
| `app/api/v1/media/upload-url/route.ts` | **storage_key path change.** New convention: `users/<auth.uid()>/aircraft/<aircraft_id>/sessions/<session_id>/<media_type>/<asset_id>-<sanitized_filename>`. Reads `auth.uid()` and joins to `preflight_sessions.aircraft_id`. RLS on `storage.objects` enforces by path prefix |
| `app/api/v1/media/[id]/complete/route.ts` | unchanged (operates on row ids, not paths) |
| `app/api/v1/media/[id]/transcribe/route.ts` | unchanged |
| `app/api/v1/issues/[id]/observations/route.ts` | unchanged (RLS gates the issue UPDATE) |
| `lib/api/sessions.ts` `useSessions()` hook | accepts an `aircraftId` argument now, scoped fetches |
| `lib/api/issues.ts` hooks | already take `aircraftId` — verify URL params drive them |
| `lib/api/media.ts` | unchanged — pipeline already works through the API |
| `lib/types/database.ts` | add `Aircraft.user_id`; add `AuthUser` (id + email); generated types in `lib/types/supabase-generated.ts` (new) act as a reference, not a replacement |
| `app/api/v1/aircraft/[id]/active-issues/route.ts` | already aircraft-scoped — no changes |
| `next.config.mjs` | unchanged |
| `.env.example` | unchanged (publishable key + url + openai key are the same) |
| `docs/plans/m1-supabase-integration.md` | append a final "M4 RESOLUTION" section to the consolidated debt — debts 1–5 marked resolved, debt 7 (`quick_tag` drop) carried forward to M5 |

## 3. Files to DELETE

| Path | Why |
|---|---|
| `app/(app)/page.tsx` | replaced by `/aircraft/[id]/dashboard` |
| `app/(app)/sessions/page.tsx` | replaced by `/aircraft/[id]/sessions` |
| `app/(app)/memory/page.tsx` | replaced by `/aircraft/[id]/memory` |

The `app/(app)/layout.tsx` STAYS — it remains the shared layout for everything inside the route group, including the new `aircraft/[id]/*` subtree.

---

## 3 (cont). Exact RLS policies — the seven tables

All policies are `to authenticated`. Anon role has zero policies on any of these tables post-M4.

### `public.aircraft` — direct ownership

```sql
create policy "aircraft_select_own"
  on public.aircraft for select to authenticated
  using (user_id = auth.uid());

create policy "aircraft_insert_own"
  on public.aircraft for insert to authenticated
  with check (user_id = auth.uid());

create policy "aircraft_update_own"
  on public.aircraft for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "aircraft_delete_own"
  on public.aircraft for delete to authenticated
  using (user_id = auth.uid());
```

### `public.preflight_sessions` — scoped via `aircraft.user_id`

```sql
create policy "sessions_select_own"
  on public.preflight_sessions for select to authenticated
  using (
    aircraft_id in (select id from public.aircraft where user_id = auth.uid())
  );

create policy "sessions_insert_own"
  on public.preflight_sessions for insert to authenticated
  with check (
    aircraft_id in (select id from public.aircraft where user_id = auth.uid())
  );

create policy "sessions_update_own"
  on public.preflight_sessions for update to authenticated
  using (
    aircraft_id in (select id from public.aircraft where user_id = auth.uid())
  )
  with check (
    aircraft_id in (select id from public.aircraft where user_id = auth.uid())
  );

create policy "sessions_delete_own"
  on public.preflight_sessions for delete to authenticated
  using (
    aircraft_id in (select id from public.aircraft where user_id = auth.uid())
  );
```

### `public.media_assets` — scoped via session → aircraft → user

```sql
create policy "media_select_own"
  on public.media_assets for select to authenticated
  using (
    preflight_session_id in (
      select s.id from public.preflight_sessions s
      join public.aircraft a on a.id = s.aircraft_id
      where a.user_id = auth.uid()
    )
  );
-- analogous insert/update/delete with the same join in using/with check
```

### `public.voice_transcriptions` — scoped via session → aircraft → user

```sql
-- same join pattern as media_assets, on preflight_session_id
```

### `public.issues` — scoped via aircraft

```sql
-- same pattern as preflight_sessions, on aircraft_id
```

### `public.issue_observations` — scoped via issue → aircraft

```sql
create policy "issue_obs_select_own"
  on public.issue_observations for select to authenticated
  using (
    issue_id in (
      select i.id from public.issues i
      join public.aircraft a on a.id = i.aircraft_id
      where a.user_id = auth.uid()
    )
  );
-- analogous insert/update/delete
```

### `public.issue_types` — global read-only reference data

```sql
create policy "issue_types_read"
  on public.issue_types for select to authenticated
  using (true);
-- no insert/update/delete policies; only the postgres role can mutate (i.e. via migration)
```

### Pre-policy cleanup

```sql
revoke select, insert, update, delete on public.aircraft             from anon;
revoke select, insert, update, delete on public.preflight_sessions   from anon;
revoke select, insert, update, delete on public.media_assets         from anon;
revoke select, insert, update, delete on public.voice_transcriptions from anon;
revoke select, insert, update, delete on public.issues               from anon;
revoke select, insert, update, delete on public.issue_observations   from anon;
revoke select, insert, update, delete on public.issue_types          from anon;

grant select, insert, update, delete on public.aircraft             to authenticated;
grant select, insert, update, delete on public.preflight_sessions   to authenticated;
grant select, insert, update, delete on public.media_assets         to authenticated;
grant select, insert, update, delete on public.voice_transcriptions to authenticated;
grant select, insert, update, delete on public.issues               to authenticated;
grant select, insert, update, delete on public.issue_observations   to authenticated;
grant select                          on public.issue_types          to authenticated;

alter table public.aircraft             enable row level security;
alter table public.preflight_sessions   enable row level security;
alter table public.media_assets         enable row level security;
alter table public.voice_transcriptions enable row level security;
alter table public.issues               enable row level security;
alter table public.issue_observations   enable row level security;
alter table public.issue_types          enable row level security;
```

---

## 4. Storage policies — `flight-recall-media` bucket

### Path convention (post-M4)

```
users/<auth.uid()>/aircraft/<aircraft_id>/sessions/<session_id>/<media_type>/<asset_id>-<sanitized_filename>
```

`storage.foldername(name)` splits on `/`, so:
- `[1]` = `'users'`
- `[2]` = `auth.uid()` as text
- `[3]` = `'aircraft'`
- `[4]` = `aircraft_id`
- … etc.

The simplest reliable check: `(storage.foldername(name))[2] = auth.uid()::text`. Combined with `bucket_id` filter, this gives full per-user isolation.

### Drop M1 policies + revoke anon grant

```sql
drop policy if exists "m1_anon_upload_flight_recall_media"        on storage.objects;
drop policy if exists "m1_anon_read_flight_recall_media"          on storage.objects;
drop policy if exists "m1_anon_update_flight_recall_media"        on storage.objects;
drop policy if exists "m1_anon_read_flight_recall_media_bucket"   on storage.buckets;
revoke select on storage.buckets from anon;
```

### New auth-scoped policies

```sql
-- bucket visibility for the storage service when the authed user mints signed URLs
create policy "auth_users_see_flight_recall_bucket"
  on storage.buckets for select to authenticated
  using (id = 'flight-recall-media');

-- read own files
create policy "users_read_own_media"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'flight-recall-media'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- upload to own path (signed-upload-url and direct upload both insert here)
create policy "users_upload_own_media"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'flight-recall-media'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- update metadata on own files
create policy "users_update_own_media"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'flight-recall-media'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- delete own files (out of M4 UI scope, but having the policy is free and
-- matches a well-formed access model)
create policy "users_delete_own_media"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'flight-recall-media'
    and (storage.foldername(name))[2] = auth.uid()::text
  );
```

---

## 5. Auth UI plan

**Library:** `@supabase/ssr` (already installed, M1). No new top-level deps.

**Routes:**
- `/login` — public; if user is already authed, server redirects to `/`.
- `/signup` — public; same redirect.
- `/auth/callback` — public route handler; handles both Google OAuth code exchange AND email confirm callback. Redirects to `/` after success, `/login?error=...` on failure.
- `/auth/logout` — server route handler — `supabase.auth.signOut()` then 302 → `/login`.

**Middleware** (`middleware.ts` at root): runs on every navigation. Calls `updateSession(request)` from `utils/supabase/middleware.ts` (extended). The helper:
1. Creates a request-scoped server client.
2. Calls `getUser()` to refresh the session cookie if needed.
3. If `user === null` AND path is not in `[/login, /signup, /auth/*, /api/*, /_next/*, static assets]` → redirect to `/login?next=<path>`.
4. If `user !== null` AND path is `/login` or `/signup` → redirect to `/`.
5. API routes are NOT redirected by middleware — they handle 401 themselves so the client gets clean error responses.

**API auth check** (used in every route handler):
```ts
const { data: { user } } = await supabase.auth.getUser();
if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
```
Inserted at the top of each route. RLS would also catch unauthorized access (return empty/fail), but the explicit 401 is much better DX for the client.

**Login form** (`components/auth/login-form.tsx`): client component. Uses `createClient()` from `utils/supabase/client.ts`. Calls `supabase.auth.signInWithPassword({email, password})` for the email path, `supabase.auth.signInWithOAuth({provider: 'google', options: {redirectTo: '/auth/callback?next=/'}})` for the Google path. On success, server-side redirect via `router.push('/')` lets the smart redirect on `/` handle next-step routing.

**Signup form**: same pattern with `signUp()`. Email confirmation is OFF in Supabase config — the user is signed in immediately on success.

**Sign out**: small `<form action="/auth/logout" method="post">` button-styled component. Server side calls `signOut()` then 302 → `/login`.

---

## 6. Aircraft picker plan

### Component structure

`<AircraftPicker>` lives in `<TopNav>`, just to the right of the Flight Recall brand. It's a client component that:
- Receives the user's aircraft list via prop (passed down from the auth-aware `(app)` layout that fetched it server-side) — NOT fetched from the picker itself, to avoid a flash of "Loading…" in the nav.
- Reads the current aircraft id from `useParams()` (`/aircraft/[id]/...`).
- Renders as a small dropdown trigger showing the current tail number + chevron.
- Dropdown contents: list of aircraft (each → `router.push('/aircraft/<id>/dashboard')`) + a divider + "+ Add aircraft" item that opens `<AddAircraftDialog>`.
- After successful add: pushes to `/aircraft/<newId>/dashboard`.

If the user is on a page that isn't aircraft-scoped (e.g. `/onboarding/add-aircraft`), the picker still renders but the trigger shows "Choose aircraft" or hides entirely — TBD by Q in §9.

### Add-aircraft form

Single shared form component used by both:
- `/onboarding/add-aircraft` (the first-aircraft route — full page, no Cancel option, no escape until at least one aircraft exists)
- `<AddAircraftDialog>` (in-app modal — has Cancel)

Form fields (matches locked decisions):
- **Tail number** — required, max 20 chars, auto-uppercased + whitespace-stripped client-side (server's existing `normalize_tail_number` trigger handles persistence).
- **Aircraft type** — optional, free text up to 80 chars. Goes into a new `aircraft_type` column? Or into `make` / `model` (existing schema)? See open question Q3.

On submit, calls `POST /api/v1/aircraft` and either pushes to the new aircraft's dashboard (onboarding flow) or closes the dialog and pushes (in-app flow).

---

## 7. URL routing plan

**Public routes:**
- `/login`, `/signup`, `/auth/callback`, `/auth/logout`

**Auth-required, aircraft-agnostic routes:**
- `/onboarding/add-aircraft` — only relevant when the user has zero aircraft.
- `/` — smart redirect (server component):
  - no user → `/login`
  - user, no aircraft → `/onboarding/add-aircraft`
  - user, has aircraft → `/aircraft/<lastUsed-or-first>/dashboard`. The "lastUsed" is read from a cookie set by the `[id]` layout on every visit. If cookie is missing or stale (aircraft id no longer exists for this user), fall back to first aircraft sorted alphabetically by `tail_number`.

**Auth-required, aircraft-scoped routes:**
- `/aircraft/[id]/dashboard`
- `/aircraft/[id]/sessions`
- `/aircraft/[id]/memory`

**Aircraft-id validation** happens in `app/(app)/aircraft/[id]/layout.tsx` (server component): runs `select id from aircraft where id = params.id` — RLS will return zero rows if the id belongs to another user. If empty, server-side `notFound()` to render the 404 page. Sets a `last_aircraft_id` cookie if found (httpOnly, SameSite=Lax, 30-day max-age).

**API routes** stay at `/api/v1/...`. They take aircraft ids as URL params or body fields. The authenticated server client + RLS does the actual scoping. Routes return 401 (not redirect) when there's no session.

---

## 8. Data migration plan — explicit sequencing

> All migrations applied via `supabase db push`. CLI is linked to project ref `wmarlpurrvdlvkndsgez`. Migrations run as the `postgres` role, which **bypasses RLS** — so we can freely TRUNCATE before the lockdown.

### Migration 1 — `m4_add_user_id_to_aircraft.sql`

```sql
-- Nullable initially because rows currently have no user. The wipe in
-- migration 2 clears them; migration 3 then sets NOT NULL.
alter table public.aircraft
  add column user_id uuid references auth.users(id) on delete cascade;

create index idx_aircraft_user_id on public.aircraft(user_id);
```

### Migration 2 — `m4_wipe_existing_data.sql`

```sql
-- All user-data tables. CASCADE handles the FK chain. issue_types is
-- reference data and is preserved (its 5 seed rows stay).
truncate table
  public.issue_observations,
  public.voice_transcriptions,
  public.media_assets,
  public.preflight_sessions,
  public.issues,
  public.aircraft
  cascade;

-- Storage object metadata for the bucket. Underlying blobs are GC'd by
-- Supabase Storage after the metadata rows disappear. The user is also
-- expected to click "Empty bucket" in the dashboard belt-and-suspenders
-- (see §10 Q5).
delete from storage.objects where bucket_id = 'flight-recall-media';
```

### Migration 3 — `m4_lockdown_and_enable_rls.sql`

```sql
-- Now that aircraft has zero rows, NOT NULL is safe.
alter table public.aircraft
  alter column user_id set not null;

-- Lock anon out of the seven tables.
revoke select, insert, update, delete on public.aircraft             from anon;
revoke select, insert, update, delete on public.preflight_sessions   from anon;
revoke select, insert, update, delete on public.media_assets         from anon;
revoke select, insert, update, delete on public.voice_transcriptions from anon;
revoke select, insert, update, delete on public.issues               from anon;
revoke select, insert, update, delete on public.issue_observations   from anon;
revoke select, insert, update, delete on public.issue_types          from anon;

-- Grant CRUD to authenticated, except issue_types which is read-only.
grant select, insert, update, delete on public.aircraft             to authenticated;
grant select, insert, update, delete on public.preflight_sessions   to authenticated;
grant select, insert, update, delete on public.media_assets         to authenticated;
grant select, insert, update, delete on public.voice_transcriptions to authenticated;
grant select, insert, update, delete on public.issues               to authenticated;
grant select, insert, update, delete on public.issue_observations   to authenticated;
grant select                          on public.issue_types          to authenticated;

-- Enable RLS on all seven.
alter table public.aircraft             enable row level security;
alter table public.preflight_sessions   enable row level security;
alter table public.media_assets         enable row level security;
alter table public.voice_transcriptions enable row level security;
alter table public.issues               enable row level security;
alter table public.issue_observations   enable row level security;
alter table public.issue_types          enable row level security;

-- Create the policy set documented in §3.
[full policy SQL inlined here]
```

### Migration 4 — `m4_storage_auth_policies.sql`

```sql
drop policy if exists "m1_anon_upload_flight_recall_media"        on storage.objects;
drop policy if exists "m1_anon_read_flight_recall_media"          on storage.objects;
drop policy if exists "m1_anon_update_flight_recall_media"        on storage.objects;
drop policy if exists "m1_anon_read_flight_recall_media_bucket"   on storage.buckets;
revoke select on storage.buckets from anon;

[full policy SQL inlined here per §4]
```

### Why this order, not a single big migration

`supabase db push` wraps each file in a transaction. If a single file is bad, the whole file rolls back, no partial state. Splitting into 4 lets us:
- Review each file as a unit (especially the destructive wipe — that one warrants its own review window).
- Roll back to a partial state if something goes sideways (e.g. wipe applied but lockdown fails — the DB is in "empty + still anon-open" state, recoverable by re-running migration 3).
- Surface failures at the right layer.

### Bucket blob cleanup

`delete from storage.objects` removes the metadata rows. Supabase Storage's GC removes the underlying blobs. This *should* be sufficient. Belt-and-suspenders: I'll instruct you to also click "Empty bucket" in the Supabase dashboard's Storage view before running migrations. That's manual but catches any GC lag.

---

## 9. Open questions

1. **`aircraft.aircraft_type` — new column or reuse `make`/`model`?** The locked decisions say "optional single 'aircraft type' free-text field." Existing schema has separate `make text`, `model text`, `year int` columns from M1. Two paths:
   - (a) Add a new column `aircraft_type text` and ignore make/model/year for V1. (b) Use `make` for the free-text "Piper Cherokee" or similar. My pick: **(a) new `aircraft_type` column.** Keeps `make`/`model`/`year` properly typed for when we add structured aircraft profiles in a future milestone, and the free-text column is a clean V1 escape hatch. Confirm.

2. **`last_aircraft_id` cookie format and lifecycle.** I'm planning a cookie set in `app/(app)/aircraft/[id]/layout.tsx` (httpOnly, SameSite=Lax, Path=/, Max-Age=30d). Cleared on sign-out. Read in the root smart-redirect server component. If the value points to an aircraft id that no longer belongs to this user (e.g. across browsers), the SELECT returns zero rows under RLS and we fall back to the first aircraft alphabetically. Confirm the cookie approach (vs. localStorage, vs. a `user_profiles.last_aircraft_id` table).

3. **Sign-up email verification.** Locked decisions say "off — confirms in dashboard." I'm planning to leave Supabase's "Confirm email" toggle OFF — newly signed-up users get a session immediately. If you ever flip it back on, the `/auth/callback` route handler already covers email confirmations because it uses `exchangeCodeForSession` which handles both flows. Confirm OFF.

4. **Aircraft picker visibility on aircraft-agnostic routes.** When the user is on `/onboarding/add-aircraft` (zero aircraft), the picker has nothing to render. My plan: hide it entirely on that route. If the user is on `/login` or `/signup`, the whole `<TopNav>` doesn't render (those routes don't use the `(app)` layout). Confirm.

5. **Storage wipe via dashboard or via SQL.** `delete from storage.objects where bucket_id = 'flight-recall-media'` should clear metadata, and Supabase GC should clear underlying blobs. But Supabase's Storage layer occasionally treats the metadata rows as the source of truth and the blob GC has been known to lag. My recommendation: **do both** — dashboard "Empty bucket" first (clears blobs eagerly), then the migration's `delete from storage.objects` is a no-op cleanup. Confirm you're OK clicking the dashboard button as part of the deploy sequence.

5b. **Belt-and-suspenders dashboard step before migrations:** rotate the service-role JWT (the one that leaked in chat way back during M2 debugging). Out of M4 scope strictly speaking but worth doing while you're in the dashboard anyway. Mentioning, not blocking.

6. **`issue_types` — RLS enabled or not?** I'm planning **RLS enabled with a permissive `select to authenticated using (true)` policy.** Same effect as RLS disabled but consistent across the seven tables. No migrations of `issue_types` happen post-M4. Confirm.

7. **Storage path migration — what about the `flights_since` and other computed paths in cached signed URLs?** Signed URLs we minted today (last 24 hrs) point at the OLD path convention. After the wipe, those URLs 404. Browsers holding a stale signed URL will just see broken images. Acceptable trade-off (we're wiping anyway). Not a blocking concern, but flagging.

8. **Existing `sessions` page / `memory` page user-experience after the route move.** Routes change from `/sessions` → `/aircraft/[id]/sessions`. If you (or a test user) have a bookmark to `/sessions`, it 404s. The smart-redirect at `/` handles the common case but not direct deep links. Acceptable for V1 — bookmarks were never a documented contract.

9. **`POST /api/v1/aircraft` body shape.** Planning:
   ```jsonc
   { "tail_number": "N12345", "aircraft_type": "Piper Cherokee" }
   ```
   `tail_number` required, `aircraft_type` optional. No `make`/`model`/`year` in the body for V1 (covered by Q1). Confirm.

10. **Production verification approach for isolation.** I plan to spin up a second test user in a different browser (incognito or different profile) and verify zero data leakage via:
    (a) signed-in API calls with user B's session can't see user A's aircraft list,
    (b) anon API calls return 401 across the board,
    (c) direct GET on a known-belongs-to-user-A signed URL fails for user B.
    Will also test with a fresh user that has zero aircraft to verify the onboarding flow. Acceptable plan?

---

## 10. Acceptance test plan

### Schema + lockdown verification (run as postgres via SQL)

1. After migrations: all six user-data tables have 0 rows; `issue_types` has 5 rows; `storage.objects` for the bucket has 0 rows.
2. `aircraft.user_id` is NOT NULL with a FK to `auth.users(id)`.
3. `pg_tables.rowsecurity` is `true` for all seven tables.
4. `pg_policies` shows the new policy set; no `m1_anon_*` rows survive.
5. `anon` has zero `select/insert/update/delete` privileges on the seven tables (`information_schema.role_table_grants`).

### Auth flow (browser)

6. Anonymous browser hits `/aircraft/anything/dashboard` → middleware redirects to `/login?next=/aircraft/anything/dashboard`.
7. Anonymous `curl /api/v1/aircraft` → 401 (not 200 with empty array).
8. Sign up via email/password with `userA@example.com` → lands on `/onboarding/add-aircraft`.
9. Sign up via Google OAuth (in incognito as `userB@gmail.com`) → same.
10. Adding aircraft `N12345 / Piper Cherokee` → server creates a row with `user_id = userA.id`, redirects to `/aircraft/<newId>/dashboard`.

### M1+M2+M3 regression under auth

11. Voice flow: record → stop → upload → transcription completes → confirmation shows transcript. **Storage path is `users/<userA.id>/aircraft/<acftId>/sessions/<sessId>/audio/...`.**
12. Photo flow with `quick_tag='tire'`: photo uploads, issue auto-created/linked, /memory's Active section shows it, status chip flips yellow.
13. Carry-forward fire-and-forget still works (Still / Fixed / Skip dismiss the row immediately, server state mutates).
14. Three more carry-forward Fixed actions → status chip green, /memory Resolved section now lists them.
15. Session detail Sheet: signed-URL minting works for media, "Previous issue actions" shows photo-`logged` observations.

### Multi-tenant isolation

16. User B logs in (different browser). Adds their own aircraft `N99999`. Their dashboard, `/sessions`, `/memory` are all empty — zero rows from User A bleed through.
17. User B's `GET /api/v1/aircraft` returns ONLY their aircraft. Direct `GET /api/v1/aircraft/<userA-aircraft-id>/status` returns 404 (RLS scopes the lookup to nothing).
18. User B attempts to PUT to a known User A signed-URL path (constructed manually) → 403 from Supabase Storage (RLS path-prefix policy denies).
19. User B attempts to mint a signed-upload URL for a path with `users/<userA.id>/...` → server rejects (route validates aircraft ownership before constructing the path; even if bypassed, RLS denies the storage.objects insert).

### Logout

20. Logout clears the session cookie, redirects to `/login`. Re-hitting any aircraft URL after logout → middleware redirect to `/login`.

### Build / typecheck

21. `pnpm tsc --noEmit` exit 0 with strict mode + `ignoreBuildErrors:false`.
22. Vercel `next build` succeeds; production routes 200/302 as expected.

### Storage path verification

23. After User A uploads one photo, query `storage.objects` for `name like 'users/<userA.id>/%'` returns the new row. `name like 'sessions/%'` (the old path convention) returns zero rows.

---

## 11. Implementation order (after plan approval)

1. **Hard stop:** create the 4 migration files via `supabase migration new <name>` and surface their full SQL for review. Wait for explicit approval before `supabase db push`.
2. Apply migrations: `supabase db push`. Verify schema/RLS/storage state via the §10 SQL checks before proceeding.
3. Empty the storage bucket via the dashboard (belt-and-suspenders).
4. Generate types: `supabase gen types typescript --linked > lib/types/supabase-generated.ts`.
5. Update `lib/types/database.ts` (add `Aircraft.user_id`).
6. Write `middleware.ts` + extend `utils/supabase/middleware.ts` with `updateSession()`.
7. Write `/login`, `/signup`, `/auth/callback`, `/auth/logout` plus the form components.
8. Write `/onboarding/add-aircraft` + the shared add-aircraft form.
9. Move `app/(app)/page.tsx` → `app/(app)/aircraft/[id]/dashboard/page.tsx`. Same for sessions and memory. Update all internal links/redirects.
10. Write `app/(app)/aircraft/[id]/layout.tsx` (server) — validates ownership, sets `last_aircraft_id` cookie.
11. Write smart-redirect `app/page.tsx`.
12. Update `<TopNav>` with `<AircraftPicker>` + user menu + sign-out.
13. Update existing API routes:
    - Add 401 guards on every route handler.
    - `POST /api/v1/aircraft` (new).
    - `POST /api/v1/media/upload-url` — switch to user-scoped storage_key.
14. Verify locally: sign up, add aircraft, voice/photo/no_issues, carry-forward, /memory, signed-URL playback, session list isolation across two browser profiles.
15. `pnpm tsc --noEmit`, `pnpm dev` smoke.
16. Commit in 6–8 logical chunks (suggested split: migrations → auth UI → routing/middleware → aircraft picker → API guards + storage path → docs/debt update). Push to `main`.
17. Vercel auto-deploys (~90 s).
18. Production verification: sign-up, isolation tests, M1+M2+M3 regression curls, the §10 acceptance pass.
19. Final report.

Real-device phone test deferred to user.

---

## 12. Hard stops

1. **After this plan is written.** Wait for approval + answers to the open questions in §9.
2. **After the four migration files are written** but before `supabase db push`. Surface the full SQL of each file so you can sign off on the destructive operations (especially the wipe).
3. **None after that** — push proceeds straight through.

---

## STOP — confirm with user before proceeding

Before I create any migration files, I need from you:

1. **Approval of the file inventory + scope** in §1, §2, §3.
2. **Approval of the policy set** in §3 (cont.) and §4. Particularly the join-based RLS pattern for `media_assets` / `voice_transcriptions` / `issue_observations` (vs denormalizing `user_id` everywhere — which would simplify policies but add a column to four tables).
3. **Answers to the open questions in §9**, or just "go with your defaults."
4. **Confirmation you've already done these dashboard prereqs** (or will do them right before I run the migrations):
   - Email confirmation toggle is OFF in Supabase Authentication → Providers → Email
   - Site URL + redirect URLs include both production and `http://localhost:3000`
   - You're prepared to click "Empty bucket" on `flight-recall-media` right before migrations
   - (Optional but recommended) service-role JWT rotation, since the old one is in chat history

Once that's in, I'll create the 4 migrations via `supabase migration new`, paste the SQL back to you for one final review, then `supabase db push` and proceed to the implementation block in §11.
