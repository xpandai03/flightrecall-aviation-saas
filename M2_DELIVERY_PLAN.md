# M2 Delivery Plan — phased rollout to unlock Milestone 2

> Planning artifact. No code lands in this loop. Use it as the canonical scope reference for the per-phase execution prompts that follow.

---

## 1. Executive Summary

- **What unlocks M2:** the client's 6-section punch list and the V1 keyword detection spec, narrowed to a tight critical path (no scope creep). M3 territory (Sessions / Memory full redesign, etc.) is explicitly deferred.
- **Headline change:** today, a preflight session = exactly one input (voice OR photo OR no-issues), and the only structured issues we extract come from a 5-tag photo picker. The client wants a session = many inputs, with structured issues automatically pulled from voice transcripts using a deterministic keyword scanner (NOT an LLM).
- **Four phases, in this order:** (1) multi-input session + "End Preflight"; (2) new taxonomy + keyword/location scanner wired into transcription; (3) UX layer — auto-selected issue, photo full-screen, transcript edit; (4) visual cleanup of Sessions/Memory + verification of the post-OAuth redirect fix that just shipped.
- **Phases 1–3 are M2-blocking. Phase 4 is M2-recommended.** Phases 1+2 share a schema migration window; do them back-to-back.
- **Honest estimate:** ~48 hours of focused work for the critical path (1+2+3). With test cycles, demo prep, and inevitable client iteration, plan ~56–60 hours / 7–8 working days end to end.
- **Biggest risk:** the V1 keyword spec describes a flat issue model (`issue_type`, `location`, `summary`) but the current schema models issues as FK references to a small `issue_types` table with no location field. Phase 2 contains a load-bearing migration — picking the wrong shape here will require a re-migration in Phase 3. The plan picks one shape (extend, don't replace) and surfaces the trade-off below.
- **The dashboard redesign already shipped.** Visual debt for M2 is bounded — Sessions/Memory will read as "stale" against the dark ground until Phase 4 (or M3) cleans them up; nothing is broken.

---

## 2. Punch list synthesis (8 rows)

> Estimate scale: **S** ≤4hr · **M** 4–12hr · **L** 12–24hr · **XL** >24hr. Rounded honestly upward when in doubt.

### Row 1 — Session Flow (multi-input)

| Field | Detail |
|---|---|
| Client requirement | "ability to add multiple inputs (voice, photo, notes) within a single preflight" / "system returns back to preflight screen after each input" / "a clear 'End Preflight' action to finalize" |
| Current state | `preflight_sessions.input_type` is `text NOT NULL CHECK (input_type IN ('photo','voice','no_issues'))` (`supabase/migrations/0001_m1_schema.sql:56`). The preflight page state machine (`app/(app)/aircraft/[id]/preflight/page.tsx`) treats `idle → capture → confirming → dashboard` as the only path; "Done" on the Confirmation screen always returns the user to the dashboard. `finalized_at` column exists on the row but is never written. |
| Gap | Schema must allow many `media_assets` of mixed types per session. State machine must loop back to `idle` after each save. New `POST /api/v1/preflight-sessions/[id]/finalize` endpoint (or PATCH to set `finalized_at`). New "End Preflight" button replacing the implicit auto-finalize on Confirmation. |
| Dependencies | Row 4 (linking) — same underlying schema/UX change. |
| Estimated work | **L** (≈16h) — schema is straightforward; the meaty work is the preflight state-machine rework and wiring the new endpoint without breaking the existing single-input fast paths. |
| M2 blocker? | **Yes** — Zach explicitly: *"Right now the session ends after a single action … That won't work for real use."* |
| Risk | Medium — touching the central preflight orchestrator, which is the most-tested UX surface. |

### Row 2 — Issue Extraction + Carry Forward

| Field | Detail |
|---|---|
| Client requirement | "extract basic keywords from voice (oil, corrosion, etc.) / create a simple issue tied to the aircraft / show that issue on the next preflight" |
| Current state | Carry-forward UI exists today (`components/preflight/carry-forward.tsx`) and renders any active `issues` row with a "Still / Fixed / Skip" action (`app/api/v1/issues/[id]/observations/route.ts`). But the only path that *creates* an issue today is the photo-with-`quick_tag` upsert in `app/api/v1/media/[id]/complete/route.ts:upsertIssueForMedia`. Voice transcripts go into `voice_transcriptions.transcript_text` and `preflight_sessions.transcript_text`, then optionally into `issues.description` only if the audio was tagged at upload time (`lib/transcription-job.ts:144-165`). No keyword scanner exists. |
| Gap | Build a deterministic transcript→keyword→location pairer (`lib/issue-extraction.ts`), run it from `runTranscription` after the transcript writes back, and upsert one or more issues + observations. Carry-forward already consumes `issues`, so once issues are populated correctly the next-preflight surface "just works." |
| Dependencies | Row 3 (taxonomy must exist before extraction can map keywords to types). |
| Estimated work | **L** (≈14h) — the scanner itself is a few hours; integration + idempotency + handling multi-issue transcripts + tests is most of it. |
| M2 blocker? | **Yes** — Zach: *"Currently the system stores transcripts but does not interpret or surface anything. … this is a core part of the product."* |
| Risk | Medium — correctness over speed. False positives in the scanner are worse than misses (a noisy carry-forward erodes trust faster than a quiet one). |

### Row 3 — Issue System Structure (taxonomy)

| Field | Detail |
|---|---|
| Client requirement | "current tagging (scratch, dent, tire, oil, other) is too limited and doesn't reflect real-world usage" / "issues need to be visible without digging through past sessions" / "current structure makes it hard to understand what the issue actually is" |
| Current state | `issue_types` has exactly 5 seed rows (`supabase/migrations/0003_m3_schema.sql:39-44`). `issues` is keyed by `UNIQUE (aircraft_id, issue_type_id)` — no location, no per-instance differentiation. The dashboard's `<IssueCard>` and Memory's IssuesList already surface `issue_type.name` (M3 work shipped — visibility is *partially* solved already). |
| Gap | Replace `issue_types` seed with the V1-spec taxonomy (7 categories × ~5 subtypes ≈ 30+ types) or restructure to `category + subtype`. Add `issues.location text`. Update `UNIQUE` constraint to `(aircraft_id, issue_type_id, location)` so "oil on belly" and "oil on engine" can coexist as distinct issues. Refresh the carry-forward, IssueCard, QuickTagPicker, and Memory IssuesList labels. |
| Dependencies | Migration must land before Row 2 can wire keyword→type lookups. |
| Estimated work | **M** (≈10h) — seed change is small; **the migration of existing live data from old slugs to new types is the load-bearing work**. See §3 for the strategy. |
| M2 blocker? | **Yes** — Row 2's keyword scanner has no target taxonomy without it. |
| Risk | High — any pre-existing live `media_assets.quick_tag` and `issues` rows must be migrated. Get this wrong and a deployed user loses their issue history. The M4 wipe migration already nuked existing test data (`20260426012515_m4_wipe_existing_data.sql`), so for the current dev/preview environment the risk is low — but the moment a real user starts logging, it becomes high. |

### Row 4 — Media + Input Linking

| Field | Detail |
|---|---|
| Client requirement | "ability to attach voice + notes to a photo / all inputs grouped under a single session" |
| Current state | `media_assets.preflight_session_id` is already the FK; the data model supports many media per session. The hard limit is the `preflight_sessions.input_type` check constraint and the preflight page UX, both addressed by Row 1. Today, `notes_text` and `transcript_text` are scalar columns on `preflight_sessions` itself — fine for V1, but means "notes attached to a photo" specifically requires a small data-model decision: does each note attach to a `media_asset`, or to a `preflight_session`? |
| Gap | Once Row 1 lands, "voice + notes + photo on one session" is mostly a UX presentation question. The one open architectural call: per-media notes vs per-session notes. **Recommend per-session notes for V1** — keeps the schema small; the spec doesn't mandate per-media notes; can be promoted later if the client asks. |
| Dependencies | Row 1 (multi-input session) entirely subsumes the data-model side of this row. |
| Estimated work | **S** (≈3h, on top of Row 1) — mostly UI to surface the input-type icons together in the session detail. |
| M2 blocker? | **Yes** — but folded into Row 1 in the phase plan. |
| Risk | Low. |

### Row 5 — Bugs / Functionality

| Field | Detail |
|---|---|
| Client requirement | "(a) login/logout needs to work reliably; (b) transcription speed can be improved (not blocking); (c) ability to edit transcript would be useful (light/simple OK)" |
| Current state | (a) Smart-redirect 404 after Google OAuth was just fixed (`1a28c93` on `redesign/dashboard-foundation`). Need user re-verification on the preview. (b) Transcription uses `gpt-4o-mini-transcribe` via OpenAI (`lib/whisper.ts`); typical latency is dominated by audio length + Whisper API. (c) No transcript-edit UI exists. |
| Gap | (a) Confirm the smart-redirect fix is sufficient. (b) Out of scope for M2 (the client said "not blocking"). (c) Inline edit affordance on the Confirmation screen and on the session detail Sheet — write-back to `voice_transcriptions.transcript_text` (and re-mirror to `preflight_sessions.transcript_text`). |
| Dependencies | (c) lightly depends on Row 1 — the Confirmation screen is being reworked anyway. |
| Estimated work | (a) verified-already, **0h** if the post-OAuth flow is clean / **S 2h** if anything else surfaces. (c) **S** (≈4h) for a simple inline editor. **Total S/M (≈4–6h).** |
| M2 blocker? | (a) Yes if reproducible, otherwise no. (c) Yes — Zach explicitly listed it. (b) No. |
| Risk | Low. |

### Row 6 — UI / Visual Direction

| Field | Detail |
|---|---|
| Client requirement | "I'll send over updated direction on color scheme / visual feel / logo. We'll start aligning this as we move forward." |
| Current state | Dashboard redesign foundation pass already shipped: dark navy/teal palette, shadow-card-glow, four primitives (StatusPill, IssueCard, StatusCard, SessionRowItem), brand logo across nav + login, greeting heading, restyled preflight entry-choice. Sessions/Memory still use the legacy light shadcn palette (`emerald-50`, `amber-50`, `sky-50` etc.), which read as "stale" against the dark ground but are **not broken** — confirmed in `DASHBOARD_REDESIGN_COMPLETE.md` §7. |
| Gap | Sweep Sessions, Memory, the carry-forward card, and the post-save Confirmation screen onto the new tokens. No new design work — reuse existing primitives where they fit (`<IssueCard>`, `<SessionRowItem>`, `<StatusPill>`). |
| Dependencies | None hard. Soft dep: easier to do *after* Row 3 lands new taxonomy labels so we restyle once. |
| Estimated work | **M** (≈8h). |
| M2 blocker? | **Partial.** The dashboard already reads correctly; the demo-critical surfaces are clean. Sessions/Memory are second-class on M2 day-1 unless this lands. |
| Risk | Low. |

### Row 7 — Auto-select issue from transcript (user from-memory)

| Field | Detail |
|---|---|
| User requirement | "When voice logging completes and the transcript finishes, the system should auto-select an issue from the keyword list … User can change the auto-selected issue before finalizing the log." |
| Current state | After voice save, `<QuickTagPicker mode="voice">` shows the 5 old slugs; the user picks (or doesn't); save fires the upload; transcript happens in the background. There is no auto-select today. |
| Gap | After transcription completes (via the existing `useTranscriptionPoll` hook on the Confirmation screen), if the keyword scanner from Row 2 produced one or more issue candidates, surface them in the QuickTagPicker successor as pre-selected with the user able to change/remove. **Avoid live-transcription complexity for V1** — the user's "this may involve live transcription" suggestion is a future optimization; spec-honoring path is post-completion. |
| Dependencies | Hard on Row 2 (no scanner = nothing to auto-select). |
| Estimated work | **S/M** (≈5h) — UI tweak on top of an existing component, plus polling-completion hook tweak. |
| M2 blocker? | **Yes** — auto-selection is the visible UX layer for the keyword pipeline; Zach's "show that issue on the next preflight" requires the issue to *be created* in this preflight first. |
| Risk | Low — graceful degradation: if scanner returns zero candidates, falls back to manual selection (current behavior). |

### Row 8 — Photo full-screen preview (user from-memory)

| Field | Detail |
|---|---|
| User requirement | "When a photo is logged in a session, the user can see a thumbnail/preview but cannot open the photo full-screen. Full-screen preview needs to be added." |
| Current state | `<PhotoPreview>` (`components/preflight/photo-capture.tsx:64`) renders aspect-square; `PhotoTile` in `app/(app)/aircraft/[id]/sessions/page.tsx:306` renders the same way. Neither has tap-to-expand. |
| Gap | Reuse shadcn `<Dialog>` (already installed) as a lightbox. Tap a tile → full-screen overlay with the signed URL at native resolution + close button + (optional) caption (the photo's `quick_tag` or new keyword-issue label). |
| Dependencies | None. |
| Estimated work | **S** (≈3h). |
| M2 blocker? | **Recommended, not strictly required.** Zach didn't list it on his sheet, but it's a glaring UX gap — uncomfortable to demo without. |
| Risk | Low. |

---

## 3. Architecture changes required

### 3a. Schema deltas

```sql
-- Phase 1 migration (Row 1, Row 4)
alter table public.preflight_sessions
  drop constraint preflight_sessions_input_type_check;

-- input_type stays as a column (informational: which mode the
-- *first* input was logged in, mostly for legacy session display),
-- but is no longer enforced. Sessions are now containers; the actual
-- input mix is derivable from media_assets + voice_transcriptions.
-- Add a 'mixed' value if you'd rather track explicitly:
--   alter table … add constraint … check (input_type in
--     ('photo','voice','no_issues','mixed'));
-- — Recommend: drop check, leave column as-is. Less code churn.

-- Already-present `finalized_at timestamptz` column is now wired by the
-- new finalize endpoint. No schema change needed there.
```

```sql
-- Phase 2 migration (Row 2, Row 3)

-- Replace seed rows. Strategy: ADD new types, MIGRATE old slug usage,
-- then optionally retire the old 5 (keep them as 'other' aliases for
-- backward compat).
insert into public.issue_types (slug, name) values
  -- ENGINE/OIL
  ('oil_leak',         'Oil Leak'),
  ('oil_on_belly',     'Oil on Belly'),
  ('oil_on_engine',    'Oil on Engine'),
  ('oil_low',          'Oil Low'),
  ('oil_dirty',        'Oil Dirty'),
  -- STRUCTURAL
  ('crack',            'Crack'),
  ('corrosion',        'Corrosion'),
  -- 'dent' already exists from M3 seed; reuse it
  ('loose_panel',      'Loose Panel'),
  ('missing_fastener', 'Missing Fastener'),
  -- LANDING GEAR/TIRES
  ('tire_low',         'Tire Low'),
  ('tire_worn',        'Tire Worn'),
  ('flat_tire',        'Flat Tire'),
  ('brake_wear',       'Brake Wear'),
  ('brake_soft',       'Brake Soft'),
  -- FUEL
  ('fuel_leak',        'Fuel Leak'),
  ('fuel_smell',       'Fuel Smell'),
  ('cap_loose',        'Fuel Cap Loose'),
  ('fuel_contamination', 'Fuel Contamination'),
  -- ELECTRICAL
  ('flicker',          'Electrical Flicker'),
  ('avionics_reset',   'Avionics Reset'),
  ('low_voltage',      'Low Voltage'),
  ('battery_weak',     'Battery Weak'),
  -- FLIGHT CONTROLS
  ('stiff_control',    'Stiff Control'),
  ('unusual_resistance','Unusual Resistance'),
  ('cable_issue',      'Cable Issue'),
  ('binding',          'Binding'),
  -- GENERAL/SAFETY
  ('vibration',        'Vibration'),
  ('unusual_noise',    'Unusual Noise'),
  ('rough_engine',     'Rough Engine'),
  ('something_off',    'Something Feels Off');

-- Optional: add a `category` column to issue_types for grouping in UI.
alter table public.issue_types
  add column category text
  check (category in ('engine_oil','structural','landing_gear','fuel',
                      'electrical','flight_controls','general_safety'));

-- Backfill category for the new rows + the legacy 5:
--   scratch, dent, other → structural
--   tire → landing_gear
--   oil → engine_oil
update public.issue_types set category = 'structural' where slug in ('scratch','dent','other');
update public.issue_types set category = 'landing_gear' where slug = 'tire';
update public.issue_types set category = 'engine_oil' where slug = 'oil';
-- ... then category for the new rows by category (one UPDATE per group).

-- Add location to issues + change UNIQUE constraint.
alter table public.issues
  add column location text;

alter table public.issues
  drop constraint issues_aircraft_id_issue_type_id_key;

alter table public.issues
  add constraint issues_unique_per_location
    unique (aircraft_id, issue_type_id, location);
-- NB: PostgreSQL treats NULL as distinct in unique constraints, so
-- existing rows with location = NULL won't collide. New keyword-extracted
-- rows will populate location explicitly. If we want NULLs to dedupe,
-- use COALESCE(location, '') in a unique index instead — flagging as
-- a decision point, recommend the explicit-NULL behavior for V1.

-- Per-observation detail (raw transcript + summary). Add to observations,
-- not to issues, because a single issue accumulates multiple observations
-- across sessions and we want to keep each one's evidence separately.
alter table public.issue_observations
  add column raw_transcript text,
  add column summary text;
```

### 3b. New module: keyword extraction

`lib/issue-extraction.ts` — pure TypeScript, no I/O, no LLM:

```ts
type ExtractedIssue = {
  type_slug: string;        // matches issue_types.slug
  location: string | null;  // matches LOCATION_KEYWORDS keys, lowercased
  summary: string;          // "[Type] observed on [Location]" or fallback
  raw_transcript: string;   // the original transcript verbatim
};

// Map of issue keyword → issue_types.slug
const ISSUE_KEYWORDS: Record<string, string> = {
  "oil leak": "oil_leak",
  "oil on belly": "oil_on_belly",
  "oil on engine": "oil_on_engine",
  // ... full V1 spec
};

// Map of location keyword → canonical location label
const LOCATION_KEYWORDS: Record<string, string> = {
  "left wing": "Left Wing",
  "right wing": "Right Wing",
  "fuselage": "Fuselage",
  "belly": "Fuselage",  // belly aliases fuselage per spec
  // ... full V1 spec
};

export function extractIssues(transcript: string): ExtractedIssue[];
```

Algorithm (deterministic, per spec):
1. Lowercase + normalize whitespace on the transcript.
2. Scan for each issue keyword → record `[keyword, char_index, type_slug]`.
3. Scan for each location keyword → record `[keyword, char_index, location_label]`.
4. Pair each issue match with its closest-by-char-distance location match within a window (proposal: 50 chars on either side; tunable).
5. Emit one `ExtractedIssue` per issue match. Apply fallback: no location → `"[Type] observed (location not specified)"`; location-only with no issue → drop entirely (per spec, "store as note only" — already covered by `voice_transcriptions.transcript_text`).

Wired in `lib/transcription-job.ts:runTranscription` immediately after the transcript writes complete and before the existing `description` backfill.

### 3c. New endpoint

`POST /api/v1/preflight-sessions/[id]/finalize` — sets `finalized_at = now()`, returns the updated row. Idempotent: re-finalize is a no-op. Authentication: same `supabase.auth.getUser()` pattern as siblings.

### 3d. Carry-forward summary surface

The "Previously reported issues" surface Zach calls out is **already implemented** as `<CarryForward>` rendered on `/aircraft/[id]/preflight` when `step.kind === "idle"` (`app/(app)/aircraft/[id]/preflight/page.tsx:314`). It currently displays `issue.issue_type.name` plus `flights_since`. After Phase 2:
- Title becomes `"{issue.issue_type.name} — {issue.location ?? 'location not specified'}"`
- Subtitle copy stays the same
- Existing actions (Still / Fixed / Skip) work unchanged

No new component required. One render-string change inside the existing one.

### 3e. Migration discipline

The M4 wipe (`20260426012515_m4_wipe_existing_data.sql`) already truncated all live data, so for the current preview environment the Phase 2 migration is essentially **forward-only with no real backfill burden**. The moment a real client user logs an issue, that calculus changes. Phase 2 must include:
1. A rehearsal of the migration on a **copy** of the prod DB (not the live one).
2. A backfill SQL script that maps any existing `media_assets.quick_tag` values to new issue type slugs (e.g., `oil → oil_leak` is the closest semantic match; `scratch → ?` requires a judgment call — recommend `corrosion` or keep as `scratch` permanently as a legacy alias).
3. Re-running keyword extraction over existing `voice_transcriptions.transcript_text` rows so the historical record has structured issues. **Surface as decision: do we backfill issues for old transcripts, or leave them transcript-only?**

---

## 4. Phased delivery plan

### Phase 1 — Multi-input session + finalize (M2 #1, #4)

**Why first:** every other phase assumes a session can hold multiple inputs. Doing this first means Phase 2 doesn't have to retrofit the keyword scanner around a single-input model.

**Deliverable:**
- Migration: drop `preflight_sessions.input_type` CHECK constraint.
- New endpoint: `POST /api/v1/preflight-sessions/[id]/finalize`.
- New endpoint: `POST /api/v1/preflight-sessions/[id]/inputs` (or extend the existing voice/photo flows to accept an existing-session-id query parameter — recommend the latter, less code).
- Preflight page state-machine rework: after each save (`uploading → confirming`), **return to `idle`** with the existing session-in-progress, showing a running list of "this preflight so far" + an "Add another" set of buttons + a primary "End Preflight" button. "End Preflight" hits the finalize endpoint and routes to the dashboard.
- Dashboard tile / Sessions row-summary tweak: `summarizeSession` already groups by session — no change needed.

**Estimate:** ~16h (L). Spans schema (1h), endpoints (3h), preflight page rework (8h), confirmation/finalize UX (2h), test pass (2h).

**Done when:** a single preflight can record one voice clip + one photo + one no-issue declaration, all attached to the same session row, and "End Preflight" finalizes it.

---

### Phase 2 — New taxonomy + keyword/location scanner (M2 #2, #3)

**Why second:** unlocks Section 7's auto-select UX in Phase 3 and is the load-bearing data change. Has to land before any UI surface that displays the new types.

**Deliverable:**
- Migration: new `issue_types` rows (~30), new `issue_types.category` column (optional but recommended for UI grouping later), new `issues.location` column, new unique constraint, new `issue_observations.raw_transcript` + `issue_observations.summary` columns.
- New module: `lib/issue-extraction.ts` (pure functions, deterministic, no LLM, full unit-testable). Includes `ISSUE_KEYWORDS` and `LOCATION_KEYWORDS` maps copied verbatim from the V1 spec.
- Wire into `lib/transcription-job.ts:runTranscription`: after transcript writes complete, run `extractIssues(transcript)`, then for each `ExtractedIssue` upsert an `issues` row keyed by `(aircraft_id, type_slug, location)` and append an `issue_observations` row with `action='logged'`, `raw_transcript`, `summary`.
- Backfill script: re-run extraction on every existing `voice_transcriptions` row whose status is `completed`. **Surface decision-point as flag in the migration PR**: backfill or skip. Recommend backfill in dev, opt-in for prod.
- Update `/api/v1/aircraft/[id]/active-issues` to include `location` and `summary` in the response (or derive client-side; the column is already SELECTed via `select("*, ...")`).

**Estimate:** ~20h (L). Spans schema + seed (3h), scanner module + tests (5h), transcription-job integration (3h), idempotency/upsert plumbing (3h), backfill script + rehearsal (3h), demo path testing across the new taxonomy (3h).

**Done when:** a voice note saying "oil on the belly and corrosion on the left wing" produces two issues with correct location and a clean summary, both visible in carry-forward on the next preflight.

---

### Phase 3 — UX layer: auto-select, photo full-screen, transcript edit (M2 #5c, #7, #8)

**Why third:** layers on top of Phases 1 + 2. Each item is independently shippable but they share a target screen (Confirmation), so one focused phase.

**Deliverable:**
- **Auto-select (Row 7):** the post-voice `QuickTagPicker` (rename to `IssueConfirmation` if scope permits) becomes a list of detected issues from the just-completed scanner run. Each has type + location pre-filled + Edit / Remove. User can change before "End Preflight" finalizes. If extraction returned zero candidates, fall back to current manual-pick UX.
- **Photo full-screen (Row 8):** wrap `<PhotoPreview>` and `<PhotoTile>` (from `sessions/page.tsx`) in a `<Dialog>` lightbox. Tap → open at native resolution. Close on tap-outside or X.
- **Transcript edit (Row 5c):** on Confirmation and inside the Sessions detail sheet, add a pencil-icon affordance next to the transcript. Click → inline `<Textarea>` + Save / Cancel. Save fires `PATCH /api/v1/voice-transcriptions/[id]` (new tiny endpoint) and updates `transcript_text` on the row + the session mirror.

**Estimate:** ~12h (M). Auto-select 5h, lightbox 3h, transcript edit 4h.

**Done when:** demo flow is "log voice → see auto-selected issues → optionally edit transcript or change issues → finalize → tap photo on dashboard → photo opens full-screen."

---

### Phase 4 — Visual cleanup + verification (M2 #5a, #6)

**Why last:** non-blocking polish. Bring Sessions and Memory onto the new tokens; close the post-OAuth redirect verification loop.

**Deliverable:**
- Sweep `app/(app)/aircraft/[id]/sessions/page.tsx`, `app/(app)/aircraft/[id]/memory/page.tsx`, `components/preflight/carry-forward.tsx`, and `components/preflight/confirmation.tsx` to use `bg-bg-card` / `border-border-subtle` / `text-text-*` tokens and the existing dashboard primitives (`<IssueCard>`, `<SessionRowItem>`, `<StatusPill>`) where applicable. Retire the legacy `emerald-*`, `amber-*`, `rose-*`, `sky-*` ad-hoc palette utilities on those screens.
- Migrate remaining `<StatusChip>` consumers to `<StatusPill>` and delete `components/status-chip.tsx`.
- Re-verify the smart-redirect fix by running the sign-out → Google sign-in flow on preview after Phase 1 is merged (since Phase 1 itself touches auth-adjacent code paths via the new finalize endpoint).
- Login page: replace the legacy `bg-gradient-to-b from-background via-background to-sky-50/40` with `bg-background` so the bottom no longer tints sky-blue (flagged in `DASHBOARD_REDESIGN_COMPLETE.md` §7).

**Estimate:** ~8h (M). Sessions/Memory token sweep 5h, StatusChip retirement 2h, login background fix + verification 1h.

**Done when:** the entire app reads as one coherent dark-navy/teal product, no legacy light-palette flashes, auth flow verified clean.

---

## 5. Critical path

**Minimum to unlock M2 payment, in order:**

```
Phase 1 (16h)  →  Phase 2 (20h)  →  Phase 3 (12h)
                                          │
                          Phase 4 (8h, recommended)
```

- Total Phase 1+2+3 = **48h focused** (≈56–60h with testing/iteration).
- Phase 4 is **strongly recommended** for client demo polish but not strictly blocking — Sessions/Memory work, just look stale.
- Phases must run sequentially — no useful parallelism. The schema migration in Phase 2 depends on Phase 1's session-flow rework being stable on main first.

---

## 6. Risks & open questions

### Risks

1. **Taxonomy migration footgun (high).** If a real prod user lands before Phase 2 ships, the backfill of `media_assets.quick_tag` → new issue types becomes a load-bearing data migration. The current dev DB is empty post-M4-wipe, but assume Zach will start using the preview soon. **Mitigation:** rehearse Phase 2's migration on a snapshot before the real apply.
2. **Keyword-scanner false positives (medium).** A pilot saying "no oil leak today" would currently match `oil leak`. The V1 spec doesn't specify negation handling. **Mitigation:** ship V1 without negation, surface this to Zach as known, add a simple negation guard ("no", "not", "didn't see") in V1.1 if it bites in real testing.
3. **Multi-input session backwards compatibility (medium).** Existing single-input sessions still need to render correctly in dashboard recent-sessions, sessions list, memory list. The `summarizeSession()` helper already handles a session with no media gracefully; verify it handles a session with mixed media correctly too.
4. **Live-transcription request from the user (low, but relevant).** The user's from-memory addition mentions "may involve live transcription as the user speaks." This is significantly more complex (streaming Whisper isn't supported on the same endpoint we use; would need WebSockets or a different model) and is **out of scope for M2** by my read. Surface to user — confirm post-completion auto-select is acceptable for V1.
5. **Phase 3 concurrency (low).** Auto-select and transcript-edit both touch the Confirmation screen. If they're built by the same dev sequentially, fine. If parallelized, merge conflicts likely.

### Open questions for Zach (need answers before Phase 2 starts)

1. **Issue-type granularity.** The V1 spec lists "ENGINE / OIL: oil leak, oil on belly, oil on engine, oil low, oil dirty" — should each be a **separate `issue_type` row** (recommended in the plan above), or a single `oil` type with `description` carrying the variant? Current schema favors the former; spec is ambiguous. **Recommend: separate rows** so carry-forward can show "Oil on belly (last reported 1 flight ago)" without parsing description text.
2. **Issue merging across sessions.** If session 1 logs `oil_leak` at `Fuselage`, session 2 logs `oil_leak` at `Fuselage` — same row updated (last_seen_at refresh) ✓. But if session 1 logs `oil_leak` at `Fuselage` and session 2 logs `oil_leak` with no location specified, do they merge? **Recommend: no — different rows. Pilot can manually mark the location-less one as "fixed" if it's the same.**
3. **Auto-extraction confirmation UX.** Spec says "create a simple issue tied to the aircraft." Should the issue exist *immediately* on transcription complete (background, no user confirmation), or only after the user taps "End Preflight"? **Recommend: create immediately as `current_status='active'`, but user can remove before End Preflight.** Trade-off: if the user closes the tab mid-flow, the issue persists; that may actually be desirable.
4. **Transcript-edit re-extraction.** If a user edits a transcript, do we re-run extraction and update issues? **Recommend: no for V1, surface as TODO.** Re-running extraction risks orphan issue rows from the original transcript that the edit removed.
5. **"End Preflight" with zero inputs.** Should an empty session be persistable, or must at least one input be logged? **Recommend: require at least one input OR the explicit `no_issues` declaration; the existing no-issues photo-of-checklist UX already covers the "I checked everything" case.**

### Spec contradictions surfaced

- **Spec says** `Issue Storage: aircraft_id, session_id, issue_type, location, summary, raw_transcript, created_at`. **Current code** uses `aircraft_id` + `issue_type_id` (FK) on a long-lived `issues` table, with `issue_observations` carrying the per-session log. The plan reconciles by treating the spec's "issue_type" as the FK'd `issue_types.slug` (semantic match) and putting `raw_transcript` + `summary` on `issue_observations` (per-occurrence) rather than directly on `issues` (long-lived). **This is a deliberate reinterpretation; flag for Zach to confirm.**
- **Spec says** "NOT AI." **The repo already uses OpenAI Whisper** for transcription (the speech-to-text step is the only AI component). Zach's "NOT AI" applies to the **interpretation/extraction** step, not transcription itself. The plan honors this — extraction is pure keyword matching with no LLM.

---

## 7. Out-of-scope-for-M2 (deferred to M3+)

- Sessions and Memory **full redesign** (not just visual sweep). M3 territory per the original redesign plan.
- Live (streaming) transcription. Out of M2 scope; revisit when Whisper streaming is needed for UX.
- Negation handling in keyword scanner ("no oil leak today"). V1.1 if needed.
- Per-media notes (notes attached to a specific photo vs the session). Schema-supportable later.
- Issue-merge UX (manually combine two issues the pilot considers the same). Likely M3.
- Push notifications for unresolved issues across flights. Not requested.
- Multi-aircraft fleet rollups. Not requested.
- Issue exports / PDF reports. Not requested.
- Audit log of issue state transitions beyond what `issue_observations` already gives us. Not requested.
- Live transcription edit collaboration. Not requested.

---

## 8. Suggested execution-prompt sequence

The following per-phase prompts should be run **in order** after this plan is approved. Each prompt should reference this document as canonical scope.

1. **`/m2-phase-1-multi-input-session`** — implement the schema change, the finalize endpoint, the input-add endpoint, and the preflight page state-machine rework so a single session can hold many inputs and end with an explicit "End Preflight" action.
2. **`/m2-phase-2-keyword-extraction`** — apply the new issue_types taxonomy migration, build `lib/issue-extraction.ts` per the V1 spec, wire it into `runTranscription`, and run the backfill against existing transcripts.
3. **`/m2-phase-3-ux-layer`** — replace the post-voice tag picker with an auto-selected issue confirmation, add the photo full-screen lightbox, and ship the inline transcript edit.
4. **`/m2-phase-4-visual-cleanup`** — sweep Sessions/Memory/Carry-forward/Confirmation onto the new tokens and primitives, retire `<StatusChip>`, fix the login background, re-verify the smart-redirect post-OAuth flow.
5. **`/m2-merge-and-tag`** (post-phases) — squash-or-merge `redesign/dashboard-foundation` into `main`, tag the M2 release, and write the client-facing changelog.

Each phase ends in its own atomic commit set on the same `redesign/dashboard-foundation` branch, pushed to trigger Vercel preview rebuilds. **Do not merge to `main` until all four phases are green on the preview AND the user has done a full client-flow walkthrough.**

---

## Stop point

Plan complete. **No code lands until the per-phase prompts run.** Awaiting your review of this document, your answers to §6's open questions, and your "go" on Phase 1.
