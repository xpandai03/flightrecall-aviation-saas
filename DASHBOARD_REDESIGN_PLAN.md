# DASHBOARD_REDESIGN_PLAN.md

> Step 2 deliverable. Locks the implementation contract. No code has been written. Implementation does not start until you say "approved, implement."

Decisions on Q1–Q12 (per your authorization message) and the two prompt corrections (acceptance test #5, deliverable wording) are baked in below as load-bearing assumptions. Where this document and the original prompt disagree, this document wins.

---

## 1. Token map — exact additions to `app/globals.css`

Two-step, per Tailwind v4 convention: declare CSS vars under `:root`, then expose them to Tailwind utility generation under `@theme inline`. New additions only — the existing shadcn neutral palette stays.

### 1a. New `:root` additions

Inserted at the bottom of the existing `:root { … }` block (just before the closing brace, after the existing shadcn vars):

```css
  /* ── FlightRecall dark palette (M5 dashboard redesign) ───────────── */
  --bg-base:        #0A1628;
  --bg-card:        #11203A;
  --bg-card-glass:  rgba(20, 38, 66, 0.6);
  --border-subtle:  rgba(125, 211, 222, 0.12);

  --text-primary:   #F4F7FB;
  --text-secondary: #8FA8C4;
  --text-muted:     #5A7290;

  --accent-mint:    #5EEAD4;
  --accent-teal:    #2DD4BF;

  --status-critical: #EF4444;
  --status-warning:  #F59E0B;
  --status-clear:    #10B981;
```

### 1b. Override the existing semantic vars so the rest of the app inherits the dark ground

Same `:root` block, **immediately after** the additions in 1a — these intentionally re-bind the shadcn baseline so `<TopNav>`, sonner, dropdown menus, etc. inherit the dark surface without any per-component edits (Q5 decision):

```css
  /* Re-bind shadcn semantic vars to FlightRecall palette */
  --background: var(--bg-base);
  --foreground: var(--text-primary);
  --card: var(--bg-card);
  --card-foreground: var(--text-primary);
  --popover: var(--bg-card);
  --popover-foreground: var(--text-primary);
  --primary: var(--accent-mint);
  --primary-foreground: #062029;          /* dark text on mint button */
  --muted: var(--bg-card);
  --muted-foreground: var(--text-secondary);
  --border: var(--border-subtle);
  --ring: var(--accent-teal);
```

Notes:
- `--secondary`, `--accent`, `--destructive`, `--input`, `--chart-*`, `--sidebar-*` are deliberately **left as-is**. They aren't on the Dashboard's render path; touching them risks regressions in Sessions/Memory.
- `--primary-foreground` is hand-picked dark navy for legibility on mint, not a palette token — the spec didn't define a "primary text on mint" token. Calling it out so it's not flagged in raw-hex audit (this is in CSS, not JSX, so it's exempt per updated acceptance test #5).
- `.dark { … }` block is **not** modified (Q10).

### 1c. New `@theme inline` aliases — the Tailwind utilities they generate

Added inside the existing `@theme inline { … }` block:

```css
  /* FlightRecall palette → Tailwind utilities */
  --color-bg-base:       var(--bg-base);
  --color-bg-card:       var(--bg-card);
  --color-bg-card-glass: var(--bg-card-glass);
  --color-border-subtle: var(--border-subtle);

  --color-text-primary:   var(--text-primary);
  --color-text-secondary: var(--text-secondary);
  --color-text-muted:     var(--text-muted);

  --color-accent-mint: var(--accent-mint);
  --color-accent-teal: var(--accent-teal);

  --color-status-critical: var(--status-critical);
  --color-status-warning:  var(--status-warning);
  --color-status-clear:    var(--status-clear);
```

Resulting Tailwind utilities (these are what the components will use — never raw hex, never the existing `emerald-*/amber-*/rose-*` palette):

| Var | Background | Text | Border |
| --- | --- | --- | --- |
| `--color-bg-base` | `bg-bg-base` | `text-bg-base` | `border-bg-base` |
| `--color-bg-card` | `bg-bg-card` | — | — |
| `--color-bg-card-glass` | `bg-bg-card-glass` | — | — |
| `--color-border-subtle` | — | — | `border-border-subtle` |
| `--color-text-primary` | — | `text-text-primary` | — |
| `--color-text-secondary` | — | `text-text-secondary` | — |
| `--color-text-muted` | — | `text-text-muted` | — |
| `--color-accent-mint` | `bg-accent-mint` | `text-accent-mint` | `border-accent-mint` |
| `--color-accent-teal` | `bg-accent-teal` | `text-accent-teal` | — |
| `--color-status-critical` | `bg-status-critical` | `text-status-critical` | — |
| `--color-status-warning` | `bg-status-warning` | `text-status-warning` | — |
| `--color-status-clear` | `bg-status-clear` | `text-status-clear` | — |

Plus shadcn's existing `bg-background`, `text-foreground`, `bg-card`, `text-card-foreground`, `bg-primary`, `text-primary-foreground`, `border-border`, `text-muted-foreground` — those now resolve to the dark palette via the rebind in 1b.

Radius/spacing/shadow: not redefining. Existing `--radius` (0.625rem ≈ 10px) covers `rounded-md`. We'll use `rounded-2xl` (16px) for cards per spec. Subtle inner glow / soft shadow gets a small dedicated utility — see §1d.

### 1d. Card glow utility (one-off, in `@layer utilities`)

Spec says "Subtle inner glow / soft shadow on cards (NOT heavy drop shadows)". Adding a single utility class so all cards get the same look without four components inventing their own shadow stacks:

```css
@layer utilities {
  .shadow-card-glow {
    box-shadow:
      0 0 0 1px rgba(94, 234, 212, 0.04),       /* hairline mint outline */
      0 1px 0 0 rgba(255, 255, 255, 0.03) inset, /* top-edge highlight */
      0 8px 24px -12px rgba(8, 16, 32, 0.6);    /* soft ambient drop */
  }
}
```

Used by `<StatusCard>`, `<IssueCard>`, `<SessionRowItem>`'s container. No raw hex in JSX.

---

## 2. File-by-file change list

### Create

| File | Purpose |
| --- | --- |
| `lib/issue-derivation.ts` | Pure helpers: `formatIssueHistory`, `deriveIssueSeverity`, `mapSeverityToPillVariant`. No imports from React; safe in server components. |
| `components/dashboard/status-pill.tsx` | `<StatusPill>` — small color-coded pill, no logic. |
| `components/dashboard/issue-card.tsx` | `<IssueCard>` — single active-issue row with severity dot + title + history + pill. |
| `components/dashboard/status-card.tsx` | `<StatusCard>` — hero card with tail #, model, active-issue summary, primary CTA. |
| `components/dashboard/session-row-item.tsx` | `<SessionRowItem>` — row in Recent Sessions list. |
| `components/dashboard/index.ts` | Barrel re-export of the four primitives. |

### Modify

| File | Change | Why this scope |
| --- | --- | --- |
| `app/globals.css` | Add `:root` palette vars + rebind shadcn semantic vars + add `@theme inline` aliases + `.shadow-card-glow` utility (§1). | Tokens are foundational; every other change in this PR depends on them. Rebinding shadcn vars here means we don't restyle `<TopNav>`, `<Toaster>`, dropdowns, etc. — they inherit. |
| `app/(app)/aircraft/[id]/dashboard/page.tsx` | Replace inline `ActiveIssuesCard` / `RecentSessionsCard` / status header / CTA JSX with the four new primitives. Keep the `Promise.all` data-fetch block. Adapt the data through `summarizeSession()` and `deriveIssueSeverity()`. | Page is the only composition point for the new primitives; touching nothing else keeps blast radius tight. |
| `app/(app)/layout.tsx` | Replace `bg-gradient-to-b from-background via-background to-sky-50/40` with `bg-background` (now mapped to `--bg-base`). | Q1 decision (option c). One-line change, called out in `DASHBOARD_REDESIGN_COMPLETE.md` as a deliberately shared change. Sessions/Memory will inherit the dark ground earlier than they're redesigned — they'll look "raw" until those phases ship, but **not broken** (text-on-card pairings still work because we rebind `--card` and `--card-foreground` together). |
| `lib/api/adapter.ts` | Add `summarizeSession(session: PreflightSessionWithMedia): string` next to existing `adaptSession`. Existing `adaptSession` is **unchanged** — the new helper is additive so Sessions/Memory keep working unchanged. | Per Q11, summarizer lives next to the existing adapter; reusing the same module avoids cross-file derivation drift later. |

### Delete

| File | Confirmation |
| --- | --- |
| `styles/globals.css` | Grep ran across the repo (excluding `node_modules`) for `styles/globals` and `@/styles/globals` — **zero hits**. File is dead. Will be deleted in its own one-line commit (commit #1, see §8). |

### Explicitly NOT touched

| File / area | Why |
| --- | --- |
| Any file under `app/api/` | Backend frozen for this task. |
| `components/orb.tsx`, `components/preflight/*` | Spec calls Orb out of scope explicitly; preflight flow not in scope. |
| `components/aircraft/*`, `components/auth/*` | Not on the Dashboard render path. |
| `components/status-chip.tsx` | Q4 — leave for Sessions/Memory phase. New `<StatusPill>` is a separate component. |
| `components/top-nav.tsx` | Q5 — inherit token rebind, no structural restyle. |
| `app/(app)/aircraft/[id]/sessions/page.tsx`, `.../memory/page.tsx`, `.../preflight/page.tsx` | Out of scope phases. They'll inherit the dark ground via the layout change (§Modify) and may look "stale" until redesigned — that's acceptable per Q1. |
| `lib/api/sessions.ts`, `lib/api/issues.ts`, `lib/api/media.ts` | Pure data clients, don't need changes for this task. |
| `lib/types/database.ts` | No type additions needed; existing `ActiveIssue`, `PreflightSessionWithMedia` cover it. |
| `supabase/migrations/*`, `utils/supabase/*`, `middleware.ts` | Backend / auth — explicitly forbidden. |
| `app/dashboard/page.tsx` (the redirect) | 8-line redirect, still correct. |

---

## 3. Component APIs (final, locked)

All four primitives are presentational. **They do not call `deriveIssueSeverity` or `summarizeSession` themselves** — the page derives everything once, in the data-fetch path, and passes computed strings/enums down. That keeps the components testable in isolation and Storybook-friendly later.

### `<StatusPill>` — `components/dashboard/status-pill.tsx`

```ts
type StatusPillVariant =
  | 'needs_attention'  // red — critical issue
  | 'monitor'          // amber — non-critical issue worth watching
  | 'all_clear'        // green — no issues / hero clear-state
  | 'resolved';        // teal-muted — historical / resolved

interface StatusPillProps {
  variant: StatusPillVariant;
  /** Optional override label. Defaults to a sensible per-variant string. */
  label?: string;
  className?: string;
}

export function StatusPill(props: StatusPillProps): React.JSX.Element;
```

Default labels:
- `needs_attention` → "Needs Attention"
- `monitor` → "Monitor"
- `all_clear` → "All Clear"
- `resolved` → "Resolved"

Visual: rounded-full, `px-2.5 py-1`, `text-xs font-medium`, `tracking-wide`. Background uses status token at low opacity (`bg-status-critical/15` etc.) with the matching status color as text + a 1px ring of the same color at low opacity for definition on the dark ground.

### `<IssueCard>` — `components/dashboard/issue-card.tsx`

```ts
interface IssueCardProps {
  title: string;             // issue_type.name (e.g. "Oil residue")
  description?: string | null;  // Q6: secondary line if present
  severity: 'critical' | 'warning' | 'resolved';  // computed by page
  history?: string;          // pre-formatted via formatIssueHistory(); empty string hides line
  onClick?: () => void;      // future-proof; currently unused by Dashboard composition
  className?: string;
}

export function IssueCard(props: IssueCardProps): React.JSX.Element;
```

Visual:
- Container: `rounded-2xl bg-bg-card-glass border border-border-subtle p-4 shadow-card-glow`. If `onClick` is provided, becomes a `<button>` with hover/focus state; otherwise a `<div>`.
- Layout: severity dot (`size-2 rounded-full`) → title block (title bold, optional description in `text-text-secondary text-xs`, history in `text-text-muted text-xs`) → `<StatusPill>` (right, mapped from severity via `mapSeverityToPillVariant`).
- Severity dot color: `bg-status-critical` / `bg-status-warning` / `bg-status-clear` (the `resolved` case uses `bg-status-clear` — surprising at first read but matches "issue is no longer active = good").
- Empty `history` → the history `<div>` is not rendered (no awkward gap, matches spec edge case 3).

### `<StatusCard>` — `components/dashboard/status-card.tsx` (hero)

```ts
interface StatusCardProps {
  tailNumber: string;                   // e.g. "N1726"
  aircraftModel: string | null;         // e.g. "Cessna 172"; null hides separator
  /** When > 0, the card renders the warning headline. When 0, renders "All clear". When null/undefined, renders "Welcome — no flights logged yet." */
  activeIssueCount: number | null;
  /** History line shown under the count; e.g. "Last seen 5 flights ago" or "Last preflight: 2 days ago". Optional. */
  subline?: string;
  /** Mode: 'has_issues' | 'all_clear' | 'first_session'. Page computes this; component just renders. */
  mode: 'has_issues' | 'all_clear' | 'first_session';
  /** Server component pages can't pass functions — accept `href` instead and render a Link. */
  ctaHref: string;
  ctaLabel?: string;                    // defaults to "Start Preflight"
  className?: string;
}

export function StatusCard(props: StatusCardProps): React.JSX.Element;
```

**Important deviation from the spec's API.** The spec listed `onStartPreflight: () => void`. Server components can't pass functions across the server/client boundary unless the child is `"use client"`. Switching to `ctaHref: string` keeps `<StatusCard>` server-renderable, mirrors the existing pattern (the current Dashboard uses `<Button asChild><Link href=...>`), and avoids any unnecessary `"use client"` directive. Surfacing this here per the prompt's "if the spec conflicts with reality, surface it" rule.

Visual:
- Container: `rounded-2xl bg-bg-card border border-border-subtle p-6 shadow-card-glow`.
- Header row: `tailNumber · aircraftModel` in `text-text-primary text-sm font-medium tracking-wide` + a tiny tail icon.
- Headline:
  - `mode === 'has_issues'`: `⚠️` (lucide `AlertTriangle` in `text-status-warning`/`text-status-critical` per count) + `"{N} ACTIVE ISSUE(S)"` in uppercase, bold. Subline beneath in `text-text-secondary`.
  - `mode === 'all_clear'`: `✅` (lucide `CheckCircle2` in `text-status-clear`) + `"All clear"`. Subline beneath.
  - `mode === 'first_session'`: lucide `Plane` icon + `"Welcome — no flights logged yet."`. No subline.
- CTA: `<Link>` styled as primary button — full-width on mobile (`w-full`), `bg-accent-mint text-primary-foreground` (dark text on mint), `rounded-full h-12`, with `lucide-react` Plane icon. On `sm:` breakpoint, becomes `sm:w-auto sm:px-10`.
- Subtext below CTA: "Voice + photo. No typing." in `text-text-muted text-xs`.

### `<SessionRowItem>` — `components/dashboard/session-row-item.tsx`

```ts
interface SessionRowItemProps {
  /** Already-summarized text from summarizeSession(). Truncated to ~60ch. */
  summary: string;
  mediaType: 'voice' | 'photo' | 'mixed' | 'none';
  /** Pre-formatted relative time, e.g. "2 days ago". */
  timeAgo: string;
  /** Status pill variant for the right-hand chip. */
  status: 'critical' | 'warning' | 'all_clear';
  /** Server-component-friendly link target. */
  href: string;
  className?: string;
}

export function SessionRowItem(props: SessionRowItemProps): React.JSX.Element;
```

**Deviation from spec:** the spec listed `onClick?` and a `status: 'critical' | 'warning' | 'all_clear'` prop. Same server-component reasoning as `<StatusCard>` — `href` instead of `onClick`. Status enum kept exactly as the spec wrote it.

Visual:
- `<Link>` row, `rounded-2xl bg-bg-card-glass border border-border-subtle px-4 py-3 shadow-card-glow`, hover state lifts border opacity slightly.
- Layout: media-type icon (left, in a small mint-tinted square) → 1-line summary (truncated by CSS, since we already truncate at the data layer) → time-ago in `text-text-muted text-xs` → status pill (`<StatusPill variant={mapStatusToPill(status)} />`) → chevron.
- Mapping `status → StatusPill variant`: `critical → needs_attention`, `warning → monitor`, `all_clear → all_clear`. Done inline in the component (it's a 1-line cast).

---

## 4. Helper signatures (final, locked)

All in `lib/issue-derivation.ts` except `summarizeSession` (in `lib/api/adapter.ts` per Q11).

### `lib/issue-derivation.ts`

```ts
import type { ActiveIssue } from "@/lib/types/database";

export type IssueHistoryInput = {
  flights_since: number;
  /** Future use — V1 keyword extraction will populate this. Today: undefined. */
  occurrences?: Array<{ flight_index: number }>;
};

/**
 * Returns a humanized history string for an active issue, or "" when there's
 * no meaningful history to surface (single-occurrence case, edge case 3).
 *
 * V1: derives from `flights_since` only.
 * Future: when `occurrences` is populated, returns "Seen X flights ago. Also
 * noted Y flights ago." — see TODO in body.
 */
export function formatIssueHistory(input: IssueHistoryInput): string;
```

Behavior contract:
- `flights_since <= 1` AND no `occurrences` → `""` (single occurrence — IssueCard hides the line).
- `flights_since >= 2` AND no `occurrences` → `"Seen N flights ago"`.
- `occurrences && occurrences.length >= 2` → V2 path (TODO; not implemented in this task).

```ts
export type IssueSeverity = 'critical' | 'warning' | 'resolved';

/**
 * Per-issue severity. Q8 decision:
 *   - resolved → 'resolved'
 *   - flights_since <= 1 → 'critical'
 *   - else → 'warning'
 */
export function deriveIssueSeverity(issue: ActiveIssue): IssueSeverity;
```

Behavior contract: pure function over already-fetched issue rows. No I/O, no Date.now() — `flights_since` is server-computed.

```ts
import type { StatusPillVariant } from "@/components/dashboard/status-pill";

/** Maps the per-issue severity enum to the matching StatusPill variant.
 *  Note: 'all_clear' is reserved for empty states and is not produced here. */
export function mapSeverityToPillVariant(
  severity: IssueSeverity,
): Exclude<StatusPillVariant, 'all_clear'>;
```

Behavior: `critical → 'needs_attention'`, `warning → 'monitor'`, `resolved → 'resolved'`. Total function, no defaults.

### `lib/api/adapter.ts` (additive — `adaptSession` not modified)

```ts
import type { PreflightSessionWithMedia } from "@/lib/types/database";

/**
 * Five-tier fallback chain (Q9). Returns at most ~60 chars; longer strings
 * are truncated with a real ellipsis character "…" (not three dots).
 *
 * Priority:
 *   1. Joined issue_observations[].issue.issue_type.name (one or two, comma-joined)
 *   2. transcript_text first non-empty line
 *   3. notes_text first non-empty line
 *   4. media_assets[].quick_tag (mapped via QUICK_TAG_LABEL — never raw slug)
 *   5. status_color === 'green' → "No issues reported"; else "Logged"
 */
export function summarizeSession(session: PreflightSessionWithMedia): string;

/** Used for tier 4. Module-private, exported only for tests if needed later. */
const QUICK_TAG_LABEL: Record<QuickTag, string>;
```

Behavior contract:
- Input is the rich `PreflightSessionWithMedia` (which includes `media_assets`, `voice_transcriptions`, and — depending on the actual server query — `issue_observations`). The list endpoint at `/api/v1/preflight-sessions` returns all three joined; the dashboard's direct Supabase call currently only selects `id, input_type, status_color, created_at`.
- **Risk note:** for `summarizeSession()` to have all five tiers available on the dashboard, the page's recent-sessions query must be widened from the current `select("id, input_type, status_color, created_at")` to `select("id, input_type, status_color, created_at, transcript_text, notes_text, media_assets(*), voice_transcriptions(*), issue_observations(*, issue:issues(*, issue_type:issue_types(*))))`. This is a server-side `.select()` widening only — **no route handler / DB / RLS change**. Calling out so it's not flagged as out-of-scope.
- Tier 1 emits `name` only, no action suffix (Q9 phase decision). TODO in body for action-suffix work.
- Truncation: hard cap at 60 graphemes, append `"…"` (U+2026). Done before the string ever reaches a component.

---

## 5. Page composition order

`app/(app)/aircraft/[id]/dashboard/page.tsx`. Server component. Same data fetches as today (with the one widening described in §4 risk note), then composed via the new primitives:

```tsx
// Pseudo-JSX
<div className="flex flex-col gap-6 sm:gap-8">
  {/* Hero */}
  <StatusCard
    tailNumber={aircraft.tail_number}
    aircraftModel={aircraft.aircraft_type}
    activeIssueCount={
      sessionTimes.length === 0 ? null : activeIssueCount
    }
    subline={
      mode === 'has_issues'
        ? heroSubline                 // e.g. "Last seen 5 flights ago"
        : mode === 'all_clear'
          ? `Last preflight ${formatRelative(lastSessionAt)}`
          : undefined
    }
    mode={mode}                       // 'has_issues' | 'all_clear' | 'first_session'
    ctaHref={`/aircraft/${aircraftId}/preflight`}
  />

  {/* Active Issues */}
  <section aria-labelledby="active-issues-heading">
    <h2 id="active-issues-heading" className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-3">
      Active Issues
    </h2>
    {activeIssueCount === 0 ? (
      <div className="rounded-2xl bg-bg-card-glass border border-border-subtle p-5 shadow-card-glow flex items-center gap-3">
        <CheckCircle2 className="size-5 text-status-clear" />
        <span className="text-text-secondary text-sm">No active issues</span>
      </div>
    ) : (
      <ul className="flex flex-col gap-2">
        {activeIssues.map(issue => (
          <li key={issue.id}>
            <IssueCard
              title={issue.issue_type.name}
              description={issue.description}
              severity={deriveIssueSeverity(issue)}
              history={formatIssueHistory({ flights_since: issue.flights_since })}
            />
          </li>
        ))}
      </ul>
    )}
    {overflow > 0 && (
      <div className="mt-3 text-right">
        <Link href={`/aircraft/${aircraftId}/memory?tab=issues`} className="text-accent-mint text-xs hover:underline">
          View all {activeIssueCount} issues →
        </Link>
      </div>
    )}
  </section>

  {/* Recent Sessions */}
  <section aria-labelledby="recent-sessions-heading">
    <h2 id="recent-sessions-heading" className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-3">
      Recent Sessions
    </h2>
    {recentSessions.length === 0 ? (
      <div className="rounded-2xl bg-bg-card-glass border border-border-subtle p-5 shadow-card-glow text-center">
        <p className="text-text-secondary text-sm">No flights logged yet.</p>
        <p className="text-text-muted text-xs mt-1">Start your first preflight to begin building memory.</p>
      </div>
    ) : (
      <ul className="flex flex-col gap-2">
        {recentSessions.map(s => (
          <li key={s.id}>
            <SessionRowItem
              summary={summarizeSession(s)}
              mediaType={mediaTypeFromSession(s)}     // small inline helper in page
              timeAgo={formatRelative(s.created_at)}
              status={statusFromSession(s)}            // small inline helper in page
              href={`/aircraft/${aircraftId}/sessions`}  // route already exists, do not modify
            />
          </li>
        ))}
      </ul>
    )}
  </section>
</div>
```

Three small page-local helpers (kept in the page file, not exported — they're trivial enums):

- `mode` — derived from `(sessionTimes.length, activeIssueCount)`: `(0, _) → first_session`; `(_, 0) → all_clear`; otherwise `has_issues`.
- `heroSubline` — when `mode === 'has_issues'`, format from the most-recent active issue's `flights_since` ("Last seen N flights ago"). When `mode === 'all_clear'`, "Last preflight 2 days ago" via existing `formatRelative()`.
- `mediaTypeFromSession(s)` — `input_type === 'voice' → 'voice'`; `'photo' → 'photo'`; `'no_issues' → 'none'`. (Spec also lists `'mixed'`; today's data model is single-type per session, so we never emit it. Keep the variant for forward compat.)
- `statusFromSession(s)` — `status_color === 'green' → 'all_clear'`; `'yellow' → 'warning'`; `'red' → 'critical'`; `null → 'all_clear'` (legacy session, treat as clear).

The existing top-of-page `<StatusChip>` and `<h1>Dashboard</h1>` heading are **removed** — `<StatusCard>` carries that information now. The activity copy ("Last preflight 2 days ago — you're covered.") is **subsumed** into the StatusCard subline in `all_clear` mode.

---

## 6. Test strategy

Manual visual verification only — no Storybook, no test runner additions (Q12, no new deps).

### Viewports (Chrome DevTools device emulation)
- **390×844 (iPhone 14 / primary target)** — every layout decision is tuned for this. No horizontal scroll. Hero card visible above the fold along with at least the heading of "Active Issues."
- **768×1024 (iPad portrait)** — single column still, but with a touch more padding. Confirm cards don't go full-width-edge on a wider viewport.
- **1440×900 (desktop)** — page is centered (existing `mx-auto max-w-6xl`), single-column stack — no two-column split today (the existing `lg:grid-cols-2` is being removed). Confirm with you if that's wrong; my read of the mood board is single-column even on desktop. **Surfaced as a risk in §7.**

### Scenarios
1. **Hero "1 active issue"** (typical) — `activeIssueCount === 1`, recent sessions populated. Mint CTA, warning headline, history subline.
2. **Hero "all clear"** (`activeIssueCount === 0`, sessions exist) — green check, "All clear", "Last preflight … days ago" subline.
3. **Hero "first session"** (no sessions ever) — welcome copy, both lower sections show empty states.
4. **3+ active issues** (`status_color === 'red'`) — confirm critical-tinted hero icon, three IssueCards each with severity dot color matching `deriveIssueSeverity` output.
5. **Single-occurrence issue** (`flights_since === 1`) — IssueCard renders title only, history line absent, card height collapses.
6. **Long voice transcript** — confirm `summarizeSession` truncates to ~60 chars + `"…"`, no row wrap.
7. **Issue with description set** — secondary line below title in muted color (Q6).
8. **Resolved issue surfaced** — n/a today (server filters to `current_status = active`); covered structurally so the StatusPill variant doesn't break if the filter changes later.

### iOS Safari spot-check (390px)
Open on local dev URL via iPhone Safari (or `Responsive Design Mode` in desktop Safari at 390×844).
- Hero card visible without scroll; CTA tappable (44×44 minimum).
- No horizontal scroll anywhere on the page.
- Status colors meet WCAG AA against the dark ground (rough eyeball; the spec doesn't require formal a11y audit).
- Backdrop-blur and the new `.shadow-card-glow` render correctly (Safari is the usual culprit for `box-shadow inset` quirks).

### Regression gates
- `npm run build` — zero new TS errors.
- `npm run lint` — clean.
- `git diff --name-only main` — every modified path is one of: `app/globals.css`, `app/(app)/layout.tsx`, `app/(app)/aircraft/[id]/dashboard/page.tsx`, `lib/issue-derivation.ts`, `lib/api/adapter.ts`, `components/dashboard/*`, three markdown reports, and the `styles/globals.css` deletion. **No `app/api/` paths, no `supabase/` paths, no `utils/supabase/` paths.**
- Voice flow regression check — open Preflight, hit Start Voice, confirm Orb still mounts with the cyan listening preset and reacts to audio. (This proves we didn't accidentally break it via shared CSS bleed.)
- Raw-hex JSX/TSX audit — `grep -rEn '#[0-9A-Fa-f]{3,8}' app components --include='*.tsx' --include='*.ts'` returns zero hits inside our diff. Existing `components/orb.tsx` hex codes (the Warp shader presets) are pre-existing and out of scope, but they're inside an out-of-scope file so they shouldn't appear in `git diff` either.

---

## 7. Risks and unknowns

1. **Single-column vs. two-column on desktop.** The existing dashboard puts Active Issues + Recent Sessions side-by-side at `lg:`. The mood board (mobile-first phone screenshots) doesn't show the desktop story. My read: single-column on every viewport, since the product is "phone in cockpit" and desktop is incidental. I'll implement single-column. **If you want lg-side-by-side back, say so before I implement.**

2. **`issue.issue_type` could in principle be null** for a row whose `issue_types` join returns nothing. Today this shouldn't happen (FK is non-null), but defensively the page maps `issue.issue_type?.name ?? "Unknown issue"` to avoid a render crash. I will not add error UI beyond that fallback string.

3. **`issue.description` content quality.** The field exists on the schema but I haven't read the issue creation code paths to confirm what actually gets stored there today. If it's empty everywhere, the secondary-line render is benign (we condition on truthy). If it's full of stale or wrong text, the secondary line will leak that quality. **Not investigating further in this PR — flagging as a known unknown.**

4. **Session-row query widening.** Per §4 I plan to widen the dashboard's `select(...)` for recent sessions to include `transcript_text, notes_text, media_assets(*), voice_transcriptions(*), issue_observations(*, issue:issues(*, issue_type:issue_types(*))))`. This is a Supabase-client `.select()` change inside `app/(app)/aircraft/[id]/dashboard/page.tsx` — **not** a route or schema change. Cost: one extra join + N×~20 rows of related data per dashboard load (limit 5 sessions). Acceptable for this volume. If you'd rather I keep the lean select and live with tier-5-only summaries ("No issues reported" / "Logged"), say so.

5. **Subtle inner glow** is implemented as a single `.shadow-card-glow` utility (§1d) using a multi-stop `box-shadow`. On Safari, the `inset` highlight may be invisible — fine, it's an accent, not load-bearing. I will spot-check during verification.

6. **`<StatusCard>`'s `ctaHref` deviation from spec's `onStartPreflight`.** Already explained in §3. Calling it out one more time so it's not surprise during code review.

7. **`adaptSession` already exists and the new `summarizeSession` will partially overlap** with the logic in `adaptSession`'s `notes` derivation. I am intentionally not refactoring `adaptSession` — Sessions/Memory still use it and depend on its current output shape. `summarizeSession` is a new, independent function returning a string. Some duplication is the lesser evil here.

8. **Token rebind side effects.** Rebinding `--background`, `--foreground`, `--card`, `--primary`, etc. to the new dark palette will affect every screen, including Sessions/Memory/Preflight, immediately. That's intentional (Q1 + Q5 decisions). Specific places that may look off in this PR but **will not be fixed in this PR**:
   - `<StatusChip>` (uses `emerald-50/70` etc. — those ad-hoc palette colors are still light-tinted; the chip will render with light backgrounds on a dark ground. Visually fine but stylistically loud.)
   - The Sessions cards (`bg-card`) will become navy with the existing dark-on-light text styling — wait, no: shadcn's text uses `text-card-foreground` which we're rebinding to `--text-primary`. So text contrast is preserved. The chip case above is the only visible one.
   - `<TopNav>`'s `bg-gradient-to-br from-sky-400 to-cyan-500` logo plate stays sky-blue — still legible on the dark nav, just stylistically retro. Will be revisited in a later phase.
   - Sessions page's hover states (`hover:bg-sky-50/30`) will look like a faint blue tint on the navy ground — acceptable, not broken.

9. **CTA contrast.** `--primary-foreground` is hand-set to a dark navy (`#062029`) for legibility on the mint button. If you want it pure black or a token, say so before I implement.

10. **Empty-state copy** on the StatusCard `first_session` mode and the Recent Sessions empty state — I've drafted "Welcome — no flights logged yet." and "No flights logged yet. / Start your first preflight to begin building memory." Approve or hand-edit; trivially changeable post-implementation but worth catching now since it's user-facing.

---

## 8. Commit plan

Atomic. Branch: `redesign/dashboard-foundation`.

1. **`chore: delete dead styles/globals.css duplicate`** — single file deletion, grep confirms no imports.
2. **`feat(tokens): add dark navy/teal design tokens to globals.css`** — `:root` additions (1a + 1b), `@theme inline` aliases (1c), `.shadow-card-glow` utility (1d). No JSX touched. The repo will look broken between this commit and #5 because the rebind kicks in immediately — that's the cost of doing tokens-first per spec rule.
3. **`feat(lib): add issue-derivation helpers + session summarizer`** — `lib/issue-derivation.ts` (new) and `lib/api/adapter.ts` (additive, `summarizeSession` only). No JSX. Pure logic, no behavior change yet.
4. **`feat(dashboard): add primitive components (StatusPill, IssueCard, StatusCard, SessionRowItem)`** — five new files in `components/dashboard/` including `index.ts`. Not yet wired into the page.
5. **`feat(dashboard): redesign aircraft dashboard with new primitives`** — `app/(app)/aircraft/[id]/dashboard/page.tsx` rewritten to compose the primitives and call the helpers. Includes the recent-sessions `select(...)` widening.
6. **`chore(layout): switch shared app layout to dark token background`** — single-line change in `app/(app)/layout.tsx`. Last because it's the most visible "the whole app changed" commit; placing it last makes the bisect story clean if anything regresses.

I'd considered re-ordering #6 before #2 to minimize the broken-window window, but #6 depends on the `--bg-base` token existing, so #2 has to come first. Current order is the correct one.

The three markdown reports (`RESEARCH_FINDINGS.md`, `DASHBOARD_REDESIGN_PLAN.md`, `DASHBOARD_REDESIGN_COMPLETE.md`) will be added in their own commits at the appropriate phase boundaries — research in this PR's commit history already (already on disk now), plan committed once you approve, completion report committed last. They live at repo root and aren't application code.

---

## Stop point

Plan complete. **Stopping here. No code yet.** Awaiting "approved, implement" before I touch any source file.
