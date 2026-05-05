# DASHBOARD_REDESIGN_COMPLETE.md

> Step 3 deliverable. Implementation done. Branch: `redesign/dashboard-foundation` (six commits + this report). Awaiting your local 390px walkthrough before merge.

---

## Files created

| Path | Purpose |
| --- | --- |
| `lib/issue-derivation.ts` | `formatIssueHistory`, `deriveIssueSeverity`, `mapSeverityToPillVariant`. Pure helpers, no I/O. |
| `components/dashboard/status-pill.tsx` | `<StatusPill>` — color-coded pill (4 variants). |
| `components/dashboard/issue-card.tsx` | `<IssueCard>` — severity dot + title + description + history + StatusPill, glassy card. |
| `components/dashboard/status-card.tsx` | `<StatusCard>` — hero. Three modes: `has_issues`, `all_clear`, `first_session`. |
| `components/dashboard/session-row-item.tsx` | `<SessionRowItem>` — recent-session row. |
| `components/dashboard/index.ts` | Barrel export. |
| `RESEARCH_FINDINGS.md` | Step 1 deliverable. |
| `DASHBOARD_REDESIGN_PLAN.md` | Step 2 deliverable. |
| `DASHBOARD_REDESIGN_COMPLETE.md` | This file (Step 3 deliverable). |

## Files modified

| Path | Summary |
| --- | --- |
| `app/globals.css` | Added FlightRecall palette under `:root`, rebound shadcn semantic vars (`--background`, `--foreground`, `--card`, `--primary`, `--muted`, `--border`, `--ring`) to the new tokens, exposed all new tokens as Tailwind utilities via `@theme inline`, added `.shadow-card-glow` utility. |
| `app/(app)/aircraft/[id]/dashboard/page.tsx` | Rewrote composition with the four new primitives. Widened the recent-sessions Supabase `.select(…)` to include `transcript_text, notes_text, media_assets(...), voice_transcriptions(...), issue_observations(...)` so `summarizeSession()` has material. Severity derivation done in the page; primitives stay presentational. |
| `app/(app)/layout.tsx` | One-line: replaced `bg-gradient-to-b from-background via-background to-sky-50/40` with `bg-background`. Per Q1 — shared change called out here on purpose. |
| `lib/api/adapter.ts` | Additive: new `summarizeSession(session)` next to existing `adaptSession`. `adaptSession` is **unchanged** — Sessions/Memory still use it as-is. |

## Files deleted

| Path | Reason |
| --- | --- |
| `styles/globals.css` | Byte-identical duplicate of `app/globals.css`; grep across the repo confirmed zero imports before deletion. |

## Files explicitly NOT touched

Each below was on the table and consciously left alone:

- **`app/api/**`** — backend frozen for this task.
- **`app/dashboard/page.tsx`** — 8-line redirect, still correct; no reason to touch.
- **`components/orb.tsx`, `components/preflight/*`** — Orb/Warp explicitly out of scope; voice-recorder still mounts the listening preset.
- **`components/status-chip.tsx`** — used by Sessions / Memory / Preflight; the new `<StatusPill>` is intentionally a separate component. Migration deferred to those redesign phases (Q4).
- **`components/top-nav.tsx`** — inherits the dark token rebind; no structural restyle (Q5).
- **`app/(app)/aircraft/[id]/sessions/page.tsx`, `.../memory/page.tsx`, `.../preflight/page.tsx`** — out of scope. They inherit the dark ground via the layout change and may look "stale" until redesigned (acceptable per Q1).
- **`lib/api/sessions.ts`, `lib/api/issues.ts`, `lib/api/media.ts`** — pure data clients, no changes needed.
- **`lib/types/database.ts`** — existing types covered all needs.
- **`supabase/migrations/*`, `utils/supabase/*`, `middleware.ts`** — backend/auth, off-limits.

---

## Acceptance test status

| # | Check | Status | Notes |
| --- | --- | --- | --- |
| 1 | `npm run build` | ✅ pass | Compiled successfully in 2.8s; all routes generated. |
| 2 | `npm run lint` | ⚠️ pre-broken | The repo has no `eslint` installed in `node_modules` and no `eslint.config.*`. `npm run lint` errors with `sh: eslint: command not found`. **Pre-existing**, not introduced by this PR. Flagging for a separate cleanup. |
| 3 | Renders without console errors at 390/768/desktop | ⏳ user verification | Server-side build is clean and the route serves (HTTP 307 redirect for unauthed users, 200 for `/login`). Browser-side visual + console audit at the three viewports is yours per the protocol. |
| 4 | Primitives exported from a single index, prop types | ✅ pass | `components/dashboard/index.ts` re-exports all four. Every component has a typed prop interface. |
| 5 | Token check — zero raw hex in JSX/TSX inside the diff | ✅ pass | `git diff main...HEAD --name-only \| grep -E '\.(tsx\|ts)$' \| xargs grep -nE '#[0-9A-Fa-f]{3,8}'` returns zero matches. (The single hex in CSS is `#062029` for `--primary-foreground` — exempt per the updated rule, since it's a CSS var definition, not JSX.) |
| 6 | Empty state — no active issues | ✅ implemented | `<ActiveIssuesEmpty />` renders the green-check + "No active issues" copy. Visual check is yours. |
| 7 | Empty state — no sessions ever | ✅ implemented | `<RecentSessionsEmpty />` and `StatusCard mode="first_session"`. Visual check is yours. |
| 8 | iOS Safari at 390px | ⏳ user verification | Code is mobile-first (CTA full-width, hero `text-lg sm:text-xl`, status-pill compact). |
| 9 | Orb / Warp regression | ✅ pass | `components/orb.tsx` and `components/preflight/voice-recorder.tsx` are byte-identical to `main` (`git diff main -- components/orb.tsx components/preflight/voice-recorder.tsx` is empty). |
| 10 | No backend route files modified | ✅ pass | `git diff main...HEAD --name-only` shows: 3 markdown reports + 11 frontend paths under `app/(app)/`, `app/globals.css`, `components/dashboard/`, `lib/`, plus the `styles/globals.css` deletion. **No `app/api/` paths. No `supabase/` paths. No `utils/supabase/` paths. No `middleware.ts`.** |

The two remaining `⏳` rows are the two pause-points the protocol assigns to you: visual walkthrough at 390/768/desktop and iOS Safari spot-check.

---

## Commit history (branch `redesign/dashboard-foundation`)

```
dc3ab34 chore(layout): switch shared app layout to dark token background
f8e2605 feat(dashboard): redesign aircraft dashboard with new primitives
a0ba77e feat(dashboard): add primitive components
5d31848 feat(lib): add issue derivation helpers + session summarizer
9f1a6cf feat(tokens): add dark navy/teal design tokens to globals.css
e1ce4fa chore: delete dead styles/globals.css duplicate
```

(The plan listed six commits in this exact order; this is what landed.)

---

## Open questions / known issues

1. **Login page (`app/login/page.tsx`)** still uses the legacy `bg-gradient-to-b from-background via-background to-sky-50/40` class. With `--background` now dark, the gradient resolves to dark→dark→sky-50, leaving a sky-blue tint at the bottom of the unauthenticated screen. Out of scope for this task. **Recommended cleanup later:** swap to `bg-background` like we did for `app/(app)/layout.tsx`.
2. **`<TopNav>`'s logo plate** (`bg-gradient-to-br from-sky-400 to-cyan-500`) still renders sky-blue. Legible on the dark nav, just stylistically retro. Will revisit when we touch the nav for navigation polish.
3. **`<StatusChip>`** (used by Sessions / Memory / Preflight) still uses the light shadcn palette (`emerald-50/70`, `amber-50/70`, `rose-50/70`). It will look loud against the new dark ground until those screens are redesigned. **This is expected** per Q4 — the new `<StatusPill>` lives next to it and `<StatusChip>` is unchanged.
4. **Diagnostic-logging commit `db5fbb8`** (already on `main`) added log statements to the aircraft creation route. Worth a separate scrub before any client demo so we don't surface request bodies or user data in server logs (HIPAA-adjacent posture). Not touched in this PR.
5. **`flights_since` derivation duplication.** The dashboard page recomputes `flights_since` directly from session timestamps the same way `app/api/v1/aircraft/[id]/active-issues/route.ts` does. We use the page's direct query (faster — no extra HTTP hop) but the logic is duplicated. If you want to consolidate, move the derivation into a shared helper that both call sites import. Not done here to keep the diff tight.
6. **Single-column on desktop.** I removed the existing `lg:grid-cols-2` split and made the dashboard single-column at every breakpoint, matching my read of the mood board. If you want side-by-side back on `lg:`, it's a small follow-up — wrap the two `<section>`s in a `grid lg:grid-cols-2 gap-6`.
7. **`description` field rendering.** I render `issue.description` as a secondary line in `<IssueCard>` when truthy. I haven't audited what's actually stored in that column today — if it's stale or wrong text it'll leak through. Worth eyeballing when you walk through the dashboard locally; if quality is poor we can hide the secondary line by passing `description={undefined}` until V1 keyword extraction lands.

---

## Suggested next steps (priming the Sessions screen prompt)

When you're ready to redesign **Sessions** (`app/(app)/aircraft/[id]/sessions/page.tsx`):

1. **Reuse the four primitives.** `<SessionRowItem>` already does the right thing for a list. The Sessions page can be a stack of `<SessionRowItem>`s grouped by date, with a sticky filter bar at the top.
2. **Replace `<StatusChip>` migration plan** — at that point, sweep all `<StatusChip>` usages (`sessions/page.tsx`, `memory/page.tsx`, `preflight/page.tsx`, `confirmation.tsx` if it uses it) and migrate to `<StatusPill>`. Then delete `components/status-chip.tsx`.
3. **Promote `formatRelative`** out of `app/(app)/aircraft/[id]/dashboard/page.tsx` into `lib/utils.ts` or `lib/format.ts`. Sessions will need it; rather than copy-paste again, lift it.
4. **`summarizeSession` already covers Sessions.** When wiring up the Sessions page, the existing `adaptSession()` produces the structured `Session` view-model used today and `summarizeSession()` produces the one-line label — both can coexist; pick whichever the new design needs row-by-row.
5. **The session-detail Sheet** at `sessions/page.tsx:50` could become a dedicated route (`/aircraft/[id]/sessions/[sessionId]`) for shareable URLs. Out of scope for the foundation pass; flagging because it's the obvious next architectural move once Sessions gets its full redesign.
6. **Memory** (`app/(app)/aircraft/[id]/memory/page.tsx`) is mostly a tabbed list view today. The redesign there is probably less invasive: re-skin the tabs, lean on `<IssueCard>` for the issues tab, lean on `<SessionRowItem>` for the sessions tab. Most of the heavy lifting is already done by this PR's primitives.

---

## Stop point

Implementation done. **Stopping here.** Per the protocol: please run locally, walk the dashboard at 390px (the primary target), iOS Safari spot-check, and any desktop sanity-eyeballing, then send feedback. I'll iterate on whatever lands, then we can talk about merging.
