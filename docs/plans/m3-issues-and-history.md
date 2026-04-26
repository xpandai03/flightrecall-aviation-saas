# M3 — Issue Tracking, Carry-Forward, Aircraft History

**Owner:** senior FS engineer
**Milestone:** M3 — turn capture-and-store into capture-and-remember
**Auth / RLS:** still OUT OF SCOPE (M4)
**Date:** 2026-04-26
**Predecessors:** M1 (`docs/plans/m1-supabase-integration.md`), M2 (`docs/plans/m2-voice-photo-capture.md`), M2 bug fix (`docs/plans/m2-bugfix-media-display.md`)

---

## Objective recap

By end of M3 a pilot can log a photo with `quick_tag = "tire"`, return to the app on a later session, and see **Tire — Seen 1 flight ago** with **Still / Fixed / Skip** before they pick voice/photo/no-issues. Tapping Fixed marks the issue resolved. Tapping Still keeps it visible on subsequent flights. The `/memory` view lets them browse all past sessions and all issues (active + resolved) for the aircraft.

The fast no-issues path stays under 5 seconds. Carry-forward never blocks; actions are optional.

---

## 1. Files to CREATE

| Path | Purpose |
|---|---|
| `docs/plans/m3-issues-and-history.md` | this file |
| `supabase/migrations/0003_m3_schema.sql` | three new tables, FK + indexes, seed of 5 issue_types, in-migration backfill from `media_assets.quick_tag`, RLS-disable + anon-grants |
| `app/api/v1/aircraft/[id]/status/route.ts` | `GET` — `{ status_color, active_issue_count }` for the aircraft |
| `app/api/v1/aircraft/[id]/active-issues/route.ts` | `GET` — top 5 active issues for carry-forward, with `flights_since` and joined `issue_type` |
| `app/api/v1/aircraft/[id]/issues/route.ts` | `GET` — all issues (active + resolved) for the aircraft history view, with joined `issue_type` |
| `app/api/v1/issues/[id]/observations/route.ts` | `POST` — record `still` \| `fixed` \| `skipped` action; mutates the parent issue accordingly |
| `lib/api/issues.ts` | client-side fetch wrappers + `useActiveIssues(aircraftId)` hook + `useAircraftStatus(aircraftId)` hook + carry-forward action helper |
| `components/preflight/carry-forward.tsx` | the inline block on the dashboard (renders only when there are active issues) |
| `app/(app)/memory/page.tsx` | full rewrite — tabs (Sessions / Issues), simple row layouts |
| `lib/status-color.ts` | server-side helper: `computeStatusColor(activeIssueCount: number): StatusColor` — single source of truth |

## 2. Files to MODIFY

| Path | Change |
|---|---|
| `lib/types/database.ts` | add `IssueType`, `Issue`, `IssueObservation`, `IssueWithType`, `ActiveIssue` (= `IssueWithType & { flights_since: number }`); extend `MediaAsset` with `issue_id: string \| null`; extend `PreflightSessionDetail` to include `issue_observations: IssueObservationWithIssue[]` |
| `lib/api/sessions.ts` | extend `getSession()` typing to surface the new `issue_observations` join |
| `app/api/v1/preflight-sessions/route.ts` | `POST` now computes `status_color` from the aircraft's active-issue count at creation time (overrides any client-supplied `status_color` for non-`no_issues` sessions). `GET` (list) extended to include `issue_observations(*, issues(*, issue_types(*)))` for the Sessions tab on `/memory` |
| `app/api/v1/preflight-sessions/[id]/route.ts` | `GET` — extend select to include `issue_observations(*, issues(*, issue_types(*)))` so the Sheet can render the "Previous issue actions" section |
| `app/api/v1/media/[id]/complete/route.ts` | when `media_type='photo'` AND `quick_tag` is set, find-or-update the `issues` row for `(aircraft_id, issue_type_id)` (UPSERT semantics), insert an `issue_observations` row with `action='logged'`, link `media_assets.issue_id`. **Photo flow only.** Voice notes never auto-create issues in V1. |
| `app/(app)/page.tsx` | hoist a `pendingActions: Map<issueId, 'still'\|'fixed'\|'skipped'>` into the dashboard state machine; render `<CarryForward>` above `<EntryChoice>` when `step.kind === 'idle' \|\| 'choosing'` and the active-issues fetch returned ≥1 row; on session creation, flush `pendingActions` to `POST /issues/[id]/observations` with the new session id; render aircraft status color in the existing chip; small refactor to ensure the chip doesn't shift when status loads |
| `app/(app)/sessions/page.tsx` | session card: replace heuristic "issues" count with the M3-shaped `status_color` pill (green / yellow / red / null) sourced from `preflight_sessions.status_color`; Sheet adds a new "Previous issue actions" section below the Findings, rendered from the new `issue_observations` join |
| `lib/api/adapter.ts` | extend `Session` view-model with `statusColor: StatusColor \| null` from the row's `status_color` column. Existing failed-transcript / transcribing copy stays |
| `lib/mock-helpers.ts` | extend `Session` view-model type with `statusColor: StatusColor \| null` |

## 3. Files to DELETE — none

`lib/mock-helpers.ts` `recentObservations` / `repeatedObservations` are still used by Memory; the rewrite removes those imports but keeps the helpers (they may go in M4 cleanup). `media_assets.quick_tag` column stays — QA cleanup will drop after issue-tracking is verified in production.

---

## 4. Schema migration — `supabase/migrations/0003_m3_schema.sql`

> User runs in Supabase SQL Editor. Agent does not auto-execute. Per M1+M2 pattern, the migration includes the RLS-disable + anon-grant tail so we don't have to chase another follow-up SQL round.

```sql
-- =====================================================================
-- Flight Recall — Milestone 3 schema
-- Adds: issue_types, issues, issue_observations
-- Extends: media_assets.issue_id (FK)
-- Backfills: existing media_assets.quick_tag → issues + observations
-- Auth/RLS: still OUT OF SCOPE (M4 debt; this migration includes the
--          RLS-disable + anon-grants tail so the new tables fit the
--          same M1+M2 pattern. Will all be repaid in 0004_m4_rls_policies.sql.)
-- M3-V1 limitation: an issue is identified by (aircraft_id, issue_type_id).
--          A "scratch" on the left wing and a "scratch" on the right wing
--          are the same row, disambiguated only by description text.
--          Documented in the M3 debt section.
-- =====================================================================

create extension if not exists pgcrypto;

-- ----- issue_types ----------------------------------------------------
create table public.issue_types (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,   -- matches media_assets.quick_tag values
  name       text not null,
  created_at timestamptz not null default now()
);

insert into public.issue_types (slug, name) values
  ('scratch', 'Scratch'),
  ('dent',    'Dent'),
  ('tire',    'Tire'),
  ('oil',     'Oil'),
  ('other',   'Other');

-- ----- issues ---------------------------------------------------------
-- One row per (aircraft_id, issue_type_id). UPSERT on subsequent
-- observations of the same type for the same aircraft.
create table public.issues (
  id              uuid primary key default gen_random_uuid(),
  aircraft_id     uuid not null references public.aircraft(id)    on delete cascade,
  issue_type_id   uuid not null references public.issue_types(id) on delete restrict,
  description     text,
  current_status  text not null default 'active'
                       check (current_status in ('active', 'resolved')),
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  resolved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (aircraft_id, issue_type_id)
);

create index idx_issues_aircraft_status on public.issues(aircraft_id, current_status);
create index idx_issues_last_seen       on public.issues(aircraft_id, last_seen_at desc);

-- Touch updated_at on row update
create or replace function public.touch_issues_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger touch_issues_updated_at_trg
before update on public.issues
for each row execute function public.touch_issues_updated_at();

-- ----- issue_observations --------------------------------------------
-- Append-only. One row per user action (or auto-log) tied to a session.
create table public.issue_observations (
  id                   uuid primary key default gen_random_uuid(),
  issue_id             uuid not null references public.issues(id)              on delete cascade,
  preflight_session_id uuid not null references public.preflight_sessions(id)  on delete cascade,
  action               text not null
                            check (action in ('logged', 'still', 'fixed', 'skipped')),
  created_at           timestamptz not null default now()
);

create index idx_issue_obs_issue   on public.issue_observations(issue_id);
create index idx_issue_obs_session on public.issue_observations(preflight_session_id);

-- ----- media_assets.issue_id -----------------------------------------
alter table public.media_assets
  add column issue_id uuid references public.issues(id) on delete set null;

create index idx_media_assets_issue on public.media_assets(issue_id);

-- ----- backfill from media_assets.quick_tag --------------------------
-- For each photo media_asset with a non-null quick_tag, find or create
-- the issue, insert a 'logged' observation tied to its preflight_session,
-- and link media_assets.issue_id. Walk in chronological order so
-- first_seen_at / last_seen_at land correctly when the same issue
-- type recurs across sessions.
do $$
declare
  rec record;
  v_issue_type_id uuid;
  v_issue_id      uuid;
begin
  for rec in
    select ma.id            as media_id,
           ma.preflight_session_id,
           ma.quick_tag,
           ps.aircraft_id,
           ps.created_at    as session_created_at
    from public.media_assets ma
    join public.preflight_sessions ps on ps.id = ma.preflight_session_id
    where ma.quick_tag is not null
      and ma.media_type = 'photo'
    order by ps.created_at asc
  loop
    select id into v_issue_type_id
    from public.issue_types
    where slug = rec.quick_tag;

    if v_issue_type_id is null then
      raise notice 'no issue_type for slug %, skipping media_asset %', rec.quick_tag, rec.media_id;
      continue;
    end if;

    insert into public.issues
      (aircraft_id, issue_type_id, first_seen_at, last_seen_at, current_status)
    values
      (rec.aircraft_id, v_issue_type_id, rec.session_created_at, rec.session_created_at, 'active')
    on conflict (aircraft_id, issue_type_id) do update set
      last_seen_at  = greatest(public.issues.last_seen_at,  excluded.last_seen_at),
      first_seen_at = least(public.issues.first_seen_at,    excluded.first_seen_at),
      updated_at    = now()
    returning id into v_issue_id;

    update public.media_assets
       set issue_id = v_issue_id
     where id = rec.media_id;

    insert into public.issue_observations
      (issue_id, preflight_session_id, action, created_at)
    values
      (v_issue_id, rec.preflight_session_id, 'logged', rec.session_created_at);
  end loop;
end $$;

-- ----- RLS-disable + anon GRANTs (M4 debt) ---------------------------
alter table public.issue_types         disable row level security;
alter table public.issues              disable row level security;
alter table public.issue_observations  disable row level security;

grant select, insert, update, delete on public.issue_types        to anon;
grant select, insert, update, delete on public.issues             to anon;
grant select, insert, update, delete on public.issue_observations to anon;
```

### M3 debt (will go in the consolidated debt section in the M1 plan)

- **Debt 1 (RLS):** extends to **seven** tables now (aircraft, preflight_sessions, media_assets, voice_transcriptions + issue_types, issues, issue_observations).
- **Debt 2 (anon GRANTs):** extends to the same seven.
- **M3-V1 issue identity limitation:** an issue is identified by `(aircraft_id, issue_type_id)`. Geographic/positional disambiguation (left wing vs right wing) lives in `description` only. Future work should add a `position` column or a free-form sub-type.
- **M3-V1 voice→issue limitation:** voice notes don't auto-create issues. NLP extraction is post-V1. Photos with `quick_tag` are the only auto-issue creation path.
- **Photo `quick_tag` column stays for now.** It's the source of truth for which issue type was tagged; `media_assets.issue_id` is the FK that follows. Drop the column in QA cleanup once issue-tracking is verified across enough live sessions.

---

## 5. Status color algorithm

Single source of truth: **`lib/status-color.ts`**.

```ts
export function computeStatusColor(activeIssueCount: number): StatusColor | null {
  if (activeIssueCount === 0) return "green";
  if (activeIssueCount <= 2)  return "yellow";
  return "red";  // 3+
}
```

**Where it runs:**
- `POST /api/v1/preflight-sessions` — at session creation. Counts `issues where aircraft_id = body.aircraft_id and current_status = 'active'`, calls `computeStatusColor()`, persists to `preflight_sessions.status_color`. Overrides any client-supplied `status_color` for `voice` / `photo` sessions. For `no_issues`, the existing M2 default of `green` is preserved (semantically more correct than the algorithmic value, since "no issues" is a positive declaration regardless of unrelated open issues — though both will usually agree). Document this nuance in the route's body comment.
- `GET /api/v1/aircraft/[id]/status` — live, on every call. Returns the *current* state, not a snapshot.

**Snapshot vs live (locked decision in this plan):** session cards show the snapshot from `status_color` (state at creation). The dashboard chip + `/memory` Issues tab show the live state. This matches user intuition: "what was the state at the time of that flight" vs "what's the state right now."

---

## 6. API route signatures

### `GET /api/v1/aircraft/[id]/status`

```jsonc
// Response 200
{ "status_color": "green" | "yellow" | "red", "active_issue_count": 0 }
// 400 invalid id, 404 aircraft not found
```

### `GET /api/v1/aircraft/[id]/active-issues`

Top **5** active issues, sorted by `last_seen_at desc`. Each row includes joined `issue_type` and computed `flights_since` (count of preflight_sessions for this aircraft with `created_at > issues.last_seen_at`, plus 1; minimum 1).

```jsonc
// Response 200
[
  {
    "id": "uuid",
    "aircraft_id": "uuid",
    "issue_type": { "id": "uuid", "slug": "tire", "name": "Tire" },
    "description": null,
    "current_status": "active",
    "first_seen_at": "...",
    "last_seen_at": "...",
    "resolved_at": null,
    "flights_since": 2
  }
]
```

`flights_since` is computed in a single round-trip via a Postgres CTE / window or two SQL calls in parallel. Implementation detail; either is fine.

### `GET /api/v1/aircraft/[id]/issues`

All issues for the aircraft, segmented active vs resolved. Used by the `/memory` Issues tab.

```jsonc
{
  "active":   [{ id, issue_type, description, last_seen_at, ... }],
  "resolved": [{ id, issue_type, description, resolved_at, last_seen_at, ... }]
}
```

### `POST /api/v1/issues/[id]/observations`

Records a carry-forward action and mutates the issue accordingly.

```jsonc
// Request
{ "action": "still" | "fixed" | "skipped",
  "preflight_session_id": "uuid" }   // required (V1; see open Q below)

// Response 201
{ "observation": IssueObservation, "issue": Issue }   // issue is the post-update state

// 400 invalid action / id
// 404 issue not found
// 409 action contradicts current state (e.g. 'still' on resolved issue)  -- optional, see open Q
```

Server side:
- `still` → `update issues set last_seen_at = now() where id = ...`
- `fixed` → `update issues set current_status='resolved', resolved_at = now() where id = ...`
- `skipped` → no issue mutation; just insert observation row
- All three insert one `issue_observations` row.

Open question on whether to attempt to set `last_seen_at` to the session's `created_at` instead of `now()` — see Open Questions §10.

### `POST /api/v1/media/[id]/complete` — modified

When `media_type='photo'` and `quick_tag` is provided in the body (or already set on the row), the route now also:

1. Looks up `issue_type_id` by slug = `quick_tag`.
2. UPSERTs an issue for `(aircraft_id, issue_type_id)`. If row exists and is `resolved`, flips it back to `active` (re-activation) and resets `resolved_at = null`.
3. Inserts an `issue_observations { issue_id, preflight_session_id, action: 'logged' }`.
4. Updates `media_assets.issue_id` on the just-completed row.

If any of those four steps fails, log to server console but **don't fail the `complete` response** — the upload itself succeeded; issue tracking is best-effort. Surface the failure in a `transcription_error`-style optional field if needed.

### Existing routes — minor extensions

- `POST /api/v1/preflight-sessions`: see status-color algorithm.
- `GET /api/v1/preflight-sessions` and `GET /preflight-sessions/[id]`: extend select to `*, media_assets(*), voice_transcriptions(*), issue_observations(*, issues(*, issue_types(*)))`. The detail route's signed-URL minting loop is unchanged.

---

## 7. Carry-forward UI component

### `components/preflight/carry-forward.tsx`

```
<CarryForward
  issues={ActiveIssue[]}              // from useActiveIssues(aircraftId)
  pendingActions={Map<issueId, action>}
  onAction={(issueId, action) => void}
  disabled={boolean}                  // true while uploading / confirming
/>
```

Layout: a single rounded card above the entry-choice block. Title row "Active issues for N739X" + small chevron. Each row:

- Issue type label (`Tire`) + small dot in the issue-type's accent color.
- "Seen N {flight\|flights} ago" subtitle, derived from `flights_since` (1 → "1 flight ago", n → "n flights ago").
- Three pill buttons: **Still present** / **Fixed** / **Skip**.
- If `pendingActions.has(issue.id)`, the row dims and the chosen action's pill goes filled-blue/filled-emerald/filled-muted; the other two go ghost.
- Tapping a pill again deselects (clears the entry from `pendingActions`).

Strict cap of 5 rows; if more exist, render a small "+ N more in /memory" link at the bottom.

If `issues.length === 0` after the fetch, the component returns `null` so nothing renders.

### Dashboard state-machine impact

Two state additions in `app/(app)/page.tsx`:

1. `pendingActions: Map<string, 'still'|'fixed'|'skipped'>` — initialized empty, lives across the idle/choosing transitions, **resets** when a session is successfully created and the actions have been flushed (or on cancel/reset).
2. The carry-forward block renders only when `step.kind === 'idle' || step.kind === 'choosing'`. As soon as recording / capturing / uploading begins, it disappears (no flicker, just a clean transition to the active capture UI).

**Flush on session creation:** every session-creation path (`handleVoiceComplete`, `handlePhotoSave`, `handleNoIssues`) gets a small wrapper that, after the session POST returns its id, fires `Promise.all` of `postObservation(issueId, action, sessionId)` for each entry in `pendingActions`. Failure of one observation doesn't fail the session; the user already saw the optimistic update, so a single toast on each failure is appropriate. After flush, `setPendingActions(new Map())`.

**If the user closes the app without capturing** the pending actions are dropped. This is V1-acceptable per the locked product decisions.

---

## 8. `/memory` page rebuild

### `app/(app)/memory/page.tsx`

Two-tab layout. Tabs implemented with the existing `components/ui/tabs.tsx` (already in the shadcn drop). Aircraft is hardcoded N739X for V1 (single seeded aircraft).

```
┌─ Memory · N739X ────────────────────────────────────┐
│ [ Sessions ] [ Issues ]                             │
│                                                     │
│ Sessions tab:                                       │
│   For each session in GET /preflight-sessions       │
│     row: date · time · input_type chip · status pill│
│   Tap → opens the same Sheet as /sessions does      │
│                                                     │
│ Issues tab:                                         │
│   "Active" header                                   │
│     For each active issue: type · last_seen_at      │
│   "Resolved" header                                 │
│     For each resolved issue: type · resolved_at     │
└─────────────────────────────────────────────────────┘
```

No charts, no aggregations, no timelines. Simple rows. The Sheet from `/sessions` can be lifted into a small shared component if needed; otherwise duplicating the trigger logic is fine for V1.

Status pills come from the existing `lib/status-color.ts` helper or directly from each session's `status_color` column.

---

## 9. Session detail "Previous issue actions" section

Inside the existing Sheet (`SessionDetail` in `app/(app)/sessions/page.tsx`), below Findings and above Audio:

```
┌─ Previous issue actions ─────────────────────────┐
│ • Tire — marked Still present                    │
│ • Oil  — marked Fixed                            │
│ • Scratch — Logged from photo                    │
└───────────────────────────────────────────────────┘
```

Renders only when `detail.issue_observations.length > 0`. Each row reads `issue_type.name` + a copy mapping for the `action` value:
- `logged`  → "Logged from photo"
- `still`   → "Marked still present"
- `fixed`   → "Marked fixed"
- `skipped` → "Skipped"

No interactivity (read-only history).

---

## 10. Open questions

1. **`POST /issues/[id]/observations` — should `last_seen_at` for `still` be stamped with `now()` or with the linked `preflight_session.created_at`?** I'm planning **`now()`** since the "Still" tap is the actual user observation event, and using `now()` is one fewer round-trip. Picking session.created_at would be slightly more correct semantically (action belongs to the session) but the difference is seconds. Confirm.

2. **Carry-forward "stale" actions:** if the user taps Fixed in carry-forward but never starts a capture (idles out, closes the tab), pending actions are dropped. Confirming that's V1-acceptable. Alternative would be to immediately POST observations with a `preflight_session_id = null` (requires loosening the FK to nullable) or to lazily flush at the next dashboard mount. Default: drop.

3. **Re-activation copy on the session detail "Previous issue actions" section.** If a photo with `quick_tag='tire'` is uploaded *after* the tire issue was previously marked `fixed`, the issue gets re-activated. Should the observation row carry an action like `re_logged` to distinguish from the original `logged`, or is `logged` sufficient (and the issue's status history is the source of truth for re-activations)? Default: keep `logged`; the four-value enum stays at `logged | still | fixed | skipped`. UI doesn't need to distinguish.

4. **`active-issue` tile cap = 5.** If exactly 5 are active and 6 exist, the "+ 1 more in /memory" link renders. If 0 active issues, the entire `<CarryForward>` returns null — confirming there's no empty-state copy ("No issues — all clear"). The "all clear" signal is the green status chip on the dashboard. Confirm.

5. **`POST /preflight-sessions` for `input_type='no_issues'` — does the snapshot status_color come from the issue count, or stay locked to 'green'?** I'm proposing **stay 'green'** (a positive declaration trumps the algorithmic count). Counter-argument: if the aircraft has 5 active open issues that the pilot is choosing to ignore today by tapping "No Issues" without actioning them, marking the session 'green' overstates the airworthiness signal. Defaulting to 'green' for now; flag to discuss.

6. **Issue description backfill** is `null` for all backfilled rows (no source text). For new auto-created issues from photo `quick_tag`, also `null`. M3-V1 doesn't expose any UI to edit description. M4+ may add an inline editor. Acceptable?

7. **`/memory` page — should the Sessions tab show ALL sessions (current behavior) or only sessions with media or active issues?** Default: all sessions. Single seeded aircraft makes the list short enough.

---

## 11. Acceptance test plan

### Schema + backfill

1. After running `0003_m3_schema.sql` in Supabase, verify in Table Editor:
   - `issue_types` has 5 rows.
   - `issues` has rows for any pre-existing `(aircraft_id, issue_type_id)` combos derived from current `media_assets.quick_tag` data — currently expecting Oil and Tire for N739X.
   - Each backfilled `media_assets` row has `issue_id` populated.
   - `issue_observations` has at least one `action='logged'` row per backfilled issue.
2. `pg_tables.rowsecurity` is `false` for the three new tables; `anon` has CRUD grants.

### Curl pass (local + production)

3. `GET /api/v1/aircraft/<N739X-uuid>/status` → `{ status_color: 'yellow', active_issue_count: 2 }` (assuming Oil + Tire are backfilled and active).
4. `GET /api/v1/aircraft/<N739X-uuid>/active-issues` → 2 rows, each with `issue_type` joined and a sensible `flights_since` integer.
5. Photo upload with `quick_tag='dent'`:
   - `POST /preflight-sessions {input_type:'photo'}` → 201
   - `POST /upload-url` + PUT + `POST /complete {quick_tag:'dent'}` → 200
   - `GET /aircraft/<id>/active-issues` → now 3 rows (yellow → red threshold crossed)
   - `GET /aircraft/<id>/status` → `{ status_color: 'red', active_issue_count: 3 }`
   - `GET /preflight-sessions/<new_session>` → row's `status_color = 'red'` (snapshot at creation)
6. Carry-forward action:
   - `POST /issues/<dent_issue_id>/observations { action:'fixed', preflight_session_id:<new_session> }` → 201
   - Verify: issue now `current_status='resolved'`, `resolved_at` populated.
   - `GET /aircraft/<id>/active-issues` → back to 2 rows.
7. `still` action: `POST /issues/<oil_issue_id>/observations { action:'still', preflight_session_id:<new> }` → issue's `last_seen_at` updated; not in resolved.
8. `skipped` action: observation inserted; issue state unchanged.
9. Re-activation: upload another photo with `quick_tag='dent'` → existing dent issue flips back from `resolved` to `active`, `resolved_at` cleared, `last_seen_at` refreshed; `media_assets.issue_id` populated on the new media.

### Browser

10. Dashboard for N739X with 2 active issues renders the Carry-Forward block above Entry Choice, dashboard chip is yellow.
11. Tap Fixed on Oil → row dims to filled-emerald state; tap voice/photo/no_issues → session created, observation flushes to server, on next dashboard mount the Oil issue is gone from carry-forward.
12. Dashboard with 0 active issues: Carry-Forward block does NOT render; chip is green.
13. `/memory` Sessions tab: list of sessions for N739X, each with status pill matching its `status_color` snapshot. Tapping opens the existing Sheet (now with Previous issue actions section).
14. `/memory` Issues tab: Active and Resolved sections, populated.
15. `/sessions` cards: status pill from snapshot `status_color`.
16. Session detail Sheet shows "Previous issue actions" when there are observations for that session.

### M1 + M2 regressions

17. M1+M2 acceptance tests (aircraft GET, session POST/GET, media upload-url + PUT + complete, transcription poll completing, Sheet rendering signed URLs) all still pass.

### Build / typecheck

18. `pnpm tsc --noEmit` → exit 0 with strict mode + `ignoreBuildErrors: false`.

---

## 12. Implementation order (after plan approval)

1. **Hard stop #2:** write `supabase/migrations/0003_m3_schema.sql` (with RLS-disable + grants tail). User runs in Supabase. Wait for confirmation that the migration applied AND the seven-tables debt-section update propagated.
2. `lib/types/database.ts` extensions; `lib/status-color.ts` helper.
3. New API routes: `aircraft/[id]/status`, `aircraft/[id]/active-issues`, `aircraft/[id]/issues`, `issues/[id]/observations`.
4. Modify `POST /preflight-sessions` (status_color compute), `GET /preflight-sessions/[id]` (extra join), `POST /media/[id]/complete` (auto-create/update issue path).
5. `lib/api/issues.ts`: client fetchers + the two hooks.
6. `components/preflight/carry-forward.tsx`.
7. Dashboard refactor (`app/(app)/page.tsx`): pendingActions state, render carry-forward, flush on session creation, status chip color.
8. Sessions list card status pill (`app/(app)/sessions/page.tsx`); Sheet "Previous issue actions" section.
9. `/memory` rewrite (`app/(app)/memory/page.tsx`): tabs, Sessions, Issues.
10. `pnpm tsc --noEmit`.
11. Local curl pass + browser smoke (desktop).
12. Commit in 5–7 logical chunks (suggested split: schema migration → server status+issues+observations routes → server complete-route auto-issue → client types+helpers+hooks → carry-forward UI + dashboard wire-up → /memory rewrite + sessions Sheet additions → docs/debt updates).
13. Push to `main`. Vercel auto-deploys (~90 s).
14. Production curl pass + final report.

Real-device phone test deferred to user.

---

## 13. Hard stops

1. **After this plan is written.** Wait for approval + answers to the 7 open questions.
2. **After `0003_m3_schema.sql` is written** — wait for user to apply via Supabase SQL Editor and confirm. The migration includes RLS-disable + grants pre-emptively, but Supabase may still surface surprises (it has every other time). If any further follow-up SQL is needed, surface it.
3. None after that — push proceeds straight through.

---

## STOP — confirm with user before proceeding

Approve / override:

1. **Plan structure** — file inventory (§1, §2), schema (§4), API surface (§6), UI component plans (§7, §8, §9).
2. **Status color algorithm** in §5 — thresholds 0/1-2/3+ and the snapshot-vs-live split.
3. **Answers to the 7 open questions in §10** — or "go with your defaults."
4. **Confirm M3 won't run into a `quick_tag` data anomaly** — i.e., that the only existing values in production are in the 5-value enum (`scratch`/`dent`/`tire`/`oil`/`other`). If you've manually inserted other values, the backfill will skip them with a notice and we'll need a follow-up.

Once that's in, I'll write `0003_m3_schema.sql`, hand it over for you to apply, then build the server routes, client helpers, carry-forward UI, /memory rewrite, sessions extensions, and ship through to production verification.
