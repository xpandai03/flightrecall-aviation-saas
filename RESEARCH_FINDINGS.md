# RESEARCH_FINDINGS.md — Dashboard Redesign Foundation Pass

> Step 1 deliverable. No code changes have been made. This is a read-only audit of the current state, with conflicts/decisions surfaced for your review before the plan is written.

---

## 1. Where the Dashboard actually lives

The spec implies a single `Dashboard` page; the codebase has two:

| Path | Role |
| --- | --- |
| `app/dashboard/page.tsx` | **Legacy redirect only.** Calls `smartRedirect("dashboard")`, returns `null`. 8 lines. |
| `app/(app)/aircraft/[id]/dashboard/page.tsx` | **The real Dashboard.** 343 lines, server component, scoped to the active aircraft. This is what we are redesigning. |

Routing flow: `/` and `/dashboard` → `smartRedirect()` (`lib/auth/smart-redirect.ts`) → resolves last-used aircraft from cookie → `redirect("/aircraft/<id>/dashboard")`.

Layout chain: `app/layout.tsx` → `app/(app)/layout.tsx` → `app/(app)/aircraft/[id]/layout.tsx` → page.

`app/(app)/layout.tsx` currently sets the page background:
```tsx
<div className="min-h-screen bg-gradient-to-b from-background via-background to-sky-50/40">
```
That sky-50 gradient will fight the new dark navy ground. **Decision needed** — see §9 Q1.

---

## 2. Current Dashboard structure (what's there now)

`app/(app)/aircraft/[id]/dashboard/page.tsx` is a server component. It renders four sections:

1. **Status header** — `<StatusChip>` with `tail_number · aircraft_type` + `<h1>Dashboard</h1>` + activity copy ("Last preflight 2 days ago — you're covered.")
2. **Start Preflight CTA** — `<Button asChild size="lg">` linking to `/aircraft/[id]/preflight`. Has a `Plane` icon, full-width on mobile.
3. **Active Issues card** — inline `<ActiveIssuesCard>` component. Empty state present. Shows up to 5 issues with amber dot + "Seen N flights ago" subtext. Overflow link to `/memory?tab=issues`.
4. **Recent Sessions card** — inline `<RecentSessionsCard>` component. Last 5 sessions. Each row: Mic/Camera/CheckCircle icon + **`"Voice note" / "Photo" / "No issues"`** label + relative time + status dot. **The label is generic, not summarized** (spec calls this out as anti-pattern).

Helpers in the same file:
- `activityIndicatorCopy(lastSessionIso)` — "Last preflight 2 days ago — you're covered." vs. "It's been 2 weeks — time for a check?"
- `formatRelative(iso)` — relative-time formatter (good, reusable).
- `inputTypeLabel(type)`, `InputTypeIcon`, `StatusDot` — small private helpers.

Data fetched in one `Promise.all` against Supabase directly (no fetch to `/api/v1`):
- aircraft row by id
- count of `issues` where `current_status = 'active'`
- top 5 active issues with `issue_type` joined, ordered by `last_seen_at desc`
- all session `created_at` values for the aircraft (used to compute `flights_since`)
- last 5 sessions: `id, input_type, status_color, created_at`

---

## 3. Tailwind setup — and the spec conflict

This repo runs **Tailwind v4**, not v3. Concretely:

- `package.json`: `"tailwindcss": "^4.1.9"`, `"@tailwindcss/postcss": "^4.1.9"`.
- `postcss.config.mjs`: only plugin is `@tailwindcss/postcss`.
- **There is no `tailwind.config.js` or `tailwind.config.ts` file.**
- All theme tokens live in CSS via the `@theme inline { … }` directive inside `app/globals.css`.
- CSS vars are defined under `:root` (light) and `.dark` (dark-mode override) in the same file.
- `@custom-variant dark (&:is(.dark *));` — dark mode is class-based but no `.dark` is currently applied to `<html>` or `<body>` in `app/layout.tsx`, so the app is effectively rendering in **light theme** today.

**Conflict with the spec.** The "Deliverable" section says "Updated `tailwind.config.{js,ts}` with the new token palette." That file does not exist and creating one would be off-pattern for v4. The correct v4 equivalent is to add the new token CSS vars under `:root` + extend the `@theme inline` block in `app/globals.css`, and let Tailwind generate utilities like `bg-bg-base`, `text-text-primary`, `bg-card-glass`, `border-subtle`, `bg-status-critical`, etc. **Surfacing as Q2 in §9.**

Also: there's a duplicate `styles/globals.css` byte-identical to `app/globals.css`. Only `app/globals.css` is imported (from `app/layout.tsx`). The `styles/` copy is dead. **Q3.**

The existing token palette is the shadcn neutral baseline (`oklch(...)`, no project-specific colors). Components today use ad-hoc Tailwind palette utilities (`emerald-500`, `amber-500`, `rose-500`, `sky-50`) rather than semantic tokens — so we are introducing semantic naming where there was none.

---

## 4. shadcn/ui inventory

`components.json`: style `"new-york"`, base color `neutral`, RSC enabled, alias `@/components/ui`.

48 components in `components/ui/`:

> accordion · alert-dialog · alert · aspect-ratio · avatar · badge · breadcrumb · button-group · button · calendar · card · carousel · chart · checkbox · collapsible · command · context-menu · dialog · drawer · dropdown-menu · empty · field · form · hover-card · input-group · input-otp · input · item · kbd · label · menubar · navigation-menu · pagination · popover · progress · radio-group · resizable · scroll-area · select · separator · sheet · sidebar · skeleton · slider · sonner · spinner · switch · table · tabs · textarea · toast · toaster · toggle · toggle-group · tooltip · use-mobile · use-toast

Used today on Dashboard / Sessions / Memory / Preflight: `button`, `badge`, `card`, `tabs`, `sheet`, `dropdown-menu`, `sonner` (Toaster). The default styling assumes the light shadcn neutral palette — they'll need dark-ground tweaks where used (`Button` default is `bg-primary text-primary-foreground` which is fine if we re-map `--primary` to mint, but most other variants will look wrong against deep navy).

Project-level (non-shadcn) components in `components/`:
- `orb.tsx` — Warp shader wrapper (out of scope).
- `status-chip.tsx` — pill with `green/yellow/red/unknown` color sets and a `Plane` icon. Currently raw Tailwind palette (`emerald-50/70`, `amber-50/70`, `rose-50/70`). **Likely to be replaced/folded into `<StatusPill>`** in this redesign. **Q4.**
- `top-nav.tsx` — sticky header with `Plane` mark, aircraft picker, tab nav (Dashboard / Sessions / Memory). Uses `border-border/60 bg-background/80 backdrop-blur`. Will need re-tokening for the dark palette but is not strictly in this task's scope unless you say so. **Q5.**
- `theme-provider.tsx`, `aircraft/`, `auth/`, `preflight/` — unrelated to Dashboard.

---

## 5. Data shapes — verified against the route handlers and types

Source of truth: `lib/types/database.ts` + the route files under `app/api/v1/`.

### `GET /api/v1/aircraft/[id]/active-issues`
File: `app/api/v1/aircraft/[id]/active-issues/route.ts`. Returns `ActiveIssue[]`:

```ts
type Issue = {
  id: string
  aircraft_id: string
  issue_type_id: string
  description: string | null
  current_status: 'active' | 'resolved'
  first_seen_at: string
  last_seen_at: string
  resolved_at: string | null
  created_at: string
  updated_at: string
}
type IssueType = { id: string; slug: 'scratch'|'dent'|'tire'|'oil'|'other'; name: string; created_at: string }
type IssueWithType = Issue & { issue_type: IssueType }
type ActiveIssue   = IssueWithType & { flights_since: number }
```

Server already computes `flights_since` (number of preflight sessions since `last_seen_at`, min 1).

**Important deltas vs. the spec's assumed shape:**
- **Title is `issue.issue_type.name`**, which today resolves to one of five generic labels: "Scratch", "Dent", "Tire wear", "Oil residue", "Other". The spec example uses free-text titles like "Oil residue under fuselage" — **the data does not yet support that resolution**. Description (`issue.description`) is nullable and largely unused. **Q6.**
- **There is no `occurrences` array on the issue.** Only `first_seen_at` + `last_seen_at` + `flights_since`. The spec's `formatIssueHistory(occurrences)` example output ("Seen 5 flights ago. Also noted 2 flights ago.") implies multi-touch history. We can:
  - (a) stick with single-line "Seen N flights ago" derived from `flights_since` (works today, matches existing UI), or
  - (b) fetch `issue_observations` joined for each visible issue (requires either an extra query in the page, or extending the route — spec forbids the latter), or
  - (c) derive observations from session-side data: `issue_observations` is already returned on `/api/v1/preflight-sessions` rows via `issue_observations(*, issue:issues(*, ...))`. Could be merged client-side.
  - **Recommend (a) for V1 with clear comment marking it as the temporary derivation. Q7.**
- **Status enum mismatch.** Spec wants per-issue status `critical | warning | resolved` (and `<StatusPill>` variants `needs_attention | monitor | all_clear | resolved`). Backend has only `active | resolved` per issue, plus the aircraft-level `green | yellow | red` rolled up by count (0 → green, 1–2 → yellow, 3+ → red, see `lib/status-color.ts`). We need a derivation rule for per-issue severity. **Q8.**

### `GET /api/v1/aircraft/[id]/status`
File: `app/api/v1/aircraft/[id]/status/route.ts`. Returns:
```ts
type AircraftStatus = { status_color: 'green' | 'yellow' | 'red'; active_issue_count: number }
```
Used as the input to the hero "1 ACTIVE ISSUE" / "All clear" copy. Maps cleanly to spec.

### `GET /api/v1/preflight-sessions?aircraftId=...&limit=...`
File: `app/api/v1/preflight-sessions/route.ts`. Returns `PreflightSessionWithMedia[]` with deep joins:
```ts
PreflightSession {
  id, aircraft_id, input_type: 'photo'|'voice'|'no_issues',
  status_color: 'green'|'yellow'|'red'|null,
  notes_text: string|null, transcript_text: string|null,
  created_at, finalized_at
}
+ media_assets: MediaAsset[]              // { media_type: 'photo'|'audio', quick_tag, signed_url? ... }
+ voice_transcriptions: VoiceTranscription[]  // { transcription_status, transcript_text, ... }
+ issue_observations: IssueObservationDetail[]  // each carries the joined issue + issue_type
```

Note the spec's data contract uses `media: Array<{ type: 'voice'|'photo'; transcript?; quick_tags? }>` — that's not the actual shape. Real shape splits across `media_assets[]` (photo/audio + single `quick_tag`) and `voice_transcriptions[]` (the transcript blob). The redesign's session-row summary will need an adapter; the existing one (`lib/api/adapter.ts → adaptSession`) already does most of the work and produces a flattened `Session` view-model with `notes`, `photos`, `repeatedFlags`, `statusColor` — we can reuse it for the "summarized content" line. **Q9.**

### Other relevant routes (for context, untouched by this task)
- `GET /api/v1/aircraft/[id]/issues` — `{ active, resolved }` split (used by Memory).
- `POST /api/v1/issues/[id]/observations` — used from preflight Carry-Forward.
- `GET/POST /api/v1/preflight-sessions/[id]` — session detail.
- `POST /api/v1/media/upload-url`, `POST /api/v1/media/[id]/complete`, `POST /api/v1/media/[id]/transcribe` — media flow.

---

## 6. Where the Orb / Warp lives — regression check

`@paper-design/shaders-react` is used in exactly one place:

- `components/orb.tsx` — wraps `Warp` with three preset states (`idle | listening | saved`).
- `components/preflight/voice-recorder.tsx:62` — `<Orb state="listening" audioLevel={0.4} />`.

**It is NOT mounted on the Dashboard.** The spec's regression check ("the Orb / Warp component still mounts and renders the same as before") therefore reduces to: don't refactor `components/orb.tsx`, don't change `components/preflight/voice-recorder.tsx`, and don't touch the package version. Confirmed — no changes needed in this task.

---

## 7. Status / severity / tag fields already on records

| Record | Field | Values |
| --- | --- | --- |
| `issues.current_status` | per-issue lifecycle | `active` \| `resolved` |
| `issues.issue_type_id` → `issue_types.slug` | tag taxonomy | `scratch`, `dent`, `tire`, `oil`, `other` (the V1 quick-tag set) |
| `preflight_sessions.status_color` | snapshot at session creation | `green` \| `yellow` \| `red` \| `null` |
| `preflight_sessions.input_type` | how the session was logged | `photo` \| `voice` \| `no_issues` |
| `media_assets.quick_tag` | photo/audio tagging | one of the 5 slugs above, nullable |
| `media_assets.upload_status` | upload lifecycle | `pending` \| `uploaded` \| `failed` |
| `voice_transcriptions.transcription_status` | bg job lifecycle | `pending` \| `processing` \| `completed` \| `failed` |
| `issue_observations.action` | per-session decision on a carried issue | `logged` \| `still` \| `fixed` \| `skipped` |

No free-text severity field exists. No "first_seen_flight_index" exists (we recompute from `created_at` timestamps).

---

## 8. Out-of-scope bug spotted (NOT fixing here)

Per spec rule "If you find a bug unrelated to the redesign, note it and do NOT fix it":

- **Recent commit `db5fbb8` is "fix: add diagnostic logging to aircraft creation route"** — i.e., a diagnostic-logging commit was merged. Worth scrubbing before any client demo so we don't surface request bodies or user data in server logs (HIPAA-adjacent posture per the prompt's guardrail). Did not read the diff; flagging as a TODO for a separate pass.
- **`app/(app)/layout.tsx`** wraps the app in a light sky gradient. Going dark, it'll need a corresponding update or the page-level override gets ugly at small heights when content is short. Noted in §9 Q1.
- **No `dark` class** is applied in `app/layout.tsx`. The shadcn `.dark { … }` palette in `globals.css` is wired but inert. We can either flip the html to dark and lean on shadcn's defaults, or define the new tokens at `:root` only and ignore the dark-mode block. **Q10.**
- Nothing about transcription / Whisper / `SUPABASE_SERVICE_ROLE_KEY` was inspected — explicitly out of scope.

---

## 9. Open questions — please answer before I write the plan

1. **`app/(app)/layout.tsx` background.** Currently `bg-gradient-to-b from-background via-background to-sky-50/40`. Three options: (a) update the layout file to use the new dark token (simplest, cleanest, but it's outside `dashboard/` so technically a shared change), (b) override only on the dashboard page with a wrapper div (keeps blast radius tight, but Sessions/Memory will look broken when we get to them next phase), (c) update the layout AND keep that change in this PR with a one-line note in `DASHBOARD_REDESIGN_COMPLETE.md`. **My recommendation: (c).**

2. **Tailwind v4 token location.** The spec says "Updated `tailwind.config.{js,ts}`" but no such file exists in this v4 project. Plan: extend `app/globals.css`'s `:root` block with the new `--bg-base / --bg-card / --accent-mint / …` vars, and add matching `--color-*` aliases inside `@theme inline { … }` so Tailwind generates utilities. Confirm acceptable.

3. **`styles/globals.css` duplicate.** Should I delete it as part of this PR (clearly dead), leave it, or copy the same edits into both? **Recommend: delete in a separate one-line commit on this branch.**

4. **`<StatusChip>` (existing).** Today's `components/status-chip.tsx` is the same idea as the spec's `<StatusPill>` but with different variants (`green|yellow|red|unknown`) and a baked-in `Plane` icon. Plan: introduce `<StatusPill>` per spec (variants `needs_attention|monitor|all_clear|resolved`), keep `<StatusChip>` untouched for now (used in Sessions, Memory, Preflight). Migrate later when we redesign those screens. Confirm.

5. **`<TopNav>` styling.** It's rendered above the Dashboard inside `app/(app)/layout.tsx`. With the new dark ground, its `bg-background/80` and the gradient launcher icon (`from-sky-400 to-cyan-500`) will look fine but a little stale. **Recommend: leave structural code untouched, but allow the new background token to flow through (`bg-background`) so the nav inherits the dark surface.** No restyle.

6. **Issue title text.** Backend gives "Oil residue", "Tire wear", etc. Spec example shows "Oil residue under fuselage" (location-aware). **Recommend for this task: render `issue.issue_type.name` as the title and `issue.description ?? ''` as a secondary line if present.** No backend change. Surface that the data layer can be enriched later (V1 keyword extraction TODO already implied in the task brief).

7. **History line.** Single-occurrence vs. multi-occurrence ("Also noted 2 flights ago"). Without an `occurrences[]` from the backend, true multi-touch history needs extra work. **Recommend Phase 1: derive `Seen N flights ago` from `flights_since` (already returned). Output empty string for `flights_since === 1` so the IssueCard collapses gracefully (matches spec edge case 3). Add `// TODO: derive multi-occurrence history once V1 keyword mapping returns occurrences[]` next to the formatter.** Confirm acceptable.

8. **Per-issue severity.** Backend only has `active | resolved`. Proposed derivation for V1, all client-side in `lib/issue-derivation.ts`:
   - `current_status === 'resolved'` → `'resolved'`
   - `flights_since <= 1` (seen on the most recent or current flight) → `'critical'`
   - else → `'warning'`
   
   Then `<StatusPill>` variant mapping: `critical → needs_attention`, `warning → monitor`, `resolved → resolved`. The `all_clear` variant is reserved for the empty state on the hero/section. Confirm rule, or give me a different rule you want.

9. **Session row summary.** The "summarized content (NOT generic 'Voice note' / 'Photo')" line. Proposed source of truth, in priority order:
   1. The session's joined `issue_observations[].issue.issue_type.name` (one or two chained, e.g. "Oil residue · Still present") — ground-truth signal that this session touched a real tracked issue.
   2. `transcript_text` first non-empty line (for voice sessions with no observations yet).
   3. `notes_text` first non-empty line (for typed/legacy).
   4. `media_assets[].quick_tag` (for photo-only sessions with no transcript).
   5. Status-based fallback: `status_color === 'green'` → "No issues reported"; else "Logged" + relative time.
   
   This is exactly the kind of derivation `lib/api/adapter.ts → adaptSession()` already partially does — I'd add a `summarizeSession(session): string` helper next to it. Confirm.

10. **Dark mode toggle.** Apply `class="dark"` to `<html>` in `app/layout.tsx`, or define new tokens only at `:root`? **Recommend: add new tokens to `:root` only** (the design IS the dark mode — there's no light counterpart). Leaves the existing shadcn `.dark { … }` block alone in case we ever want a real toggle later.

11. **Component file convention.** Codebase already uses `components/aircraft/`, `components/preflight/`, plus root-level `components/*.tsx` for cross-cutting (status-chip, top-nav, orb). I'll add a new `components/dashboard/` directory with `index.ts` re-export, matching the request from the spec's "exported from a single index". `formatIssueHistory` and the severity-derivation helper live in `lib/issue-derivation.ts` per spec. Confirm.

12. **No new dependencies.** I confirmed the spec rule. Everything for this task is doable with what's installed: `lucide-react`, `clsx`, `tailwind-merge`, `class-variance-authority`. Will not add anything.

---

## 10. Files I expect to touch (preview, not yet edited)

Will be finalized in `DASHBOARD_REDESIGN_PLAN.md`. Tentative:

**Create:**
- `lib/issue-derivation.ts` — `formatIssueHistory()`, `deriveIssueSeverity()`, `summarizeSession()`.
- `components/dashboard/status-pill.tsx`
- `components/dashboard/issue-card.tsx`
- `components/dashboard/status-card.tsx` (hero)
- `components/dashboard/session-row-item.tsx`
- `components/dashboard/index.ts` (barrel export)

**Modify:**
- `app/globals.css` — add new `:root` CSS vars + `@theme inline` color aliases.
- `app/(app)/aircraft/[id]/dashboard/page.tsx` — replace existing inline JSX with new primitives, keep server-component data fetches.
- (Pending Q1) `app/(app)/layout.tsx` — swap `bg-gradient-to-b from-background via-background to-sky-50/40` for `bg-background` (now mapped to `--bg-base`).
- (Pending Q3) Possibly delete `styles/globals.css`.

**Explicitly NOT touching:**
- Any file under `app/api/`.
- `components/orb.tsx`, `components/preflight/*`, `components/aircraft/*`, `components/auth/*`.
- `components/status-chip.tsx`, `components/top-nav.tsx` (deferred to later phases).
- `app/(app)/aircraft/[id]/sessions/page.tsx`, `app/(app)/aircraft/[id]/memory/page.tsx`, `app/(app)/aircraft/[id]/preflight/page.tsx`.
- `lib/api/*` — will read from, not modify (`adaptSession` reused).
- `supabase/migrations/*`, `lib/types/database.ts`, `utils/supabase/*`, `middleware.ts`.
- Any auth-context / session-creation flow.

---

## Stop point

Per the prompt's "STOP after research. Do not implement until user approves the plan file." I am pausing here. Once you've answered Q1–Q11 (Q12 is just a confirm), I'll write `DASHBOARD_REDESIGN_PLAN.md` and pause again before any code lands.
