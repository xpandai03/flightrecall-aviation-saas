# M2 — Voice & Photo Capture Plan

**Owner:** senior FS engineer
**Milestone:** M2 — replace scripted demo capture with real voice + photo + transcription
**Auth / RLS:** still OUT OF SCOPE (M4)
**Date:** 2026-04-25
**Predecessor:** M1 shipped same-day. See `docs/plans/m1-supabase-integration.md` for the 6 known M1 debts that M4 must repay.

---

## Objective recap

By end of M2 a pilot can, on https://flightrecall-aviation-saas.vercel.app from a phone:

1. Tap an entry CTA → choose **Voice / Photo / No Issues**
2. **Voice:** record real audio → tap stop → "Saved" confirmation in ≤ 2 s → "Transcribing…" → real transcript appears within ~10 s (poll-driven)
3. **Photo:** camera opens (or file picker on desktop) → capture → optional one-tap tag (Scratch / Dent / Tire / Oil / Other) → "Saved" confirmation
4. **No Issues:** instant save (already works from M1)
5. All three end on a Confirmation screen showing timestamp + aircraft + status + summary
6. Session shows in `/sessions` with the photo or transcript visible

Hard constraint: transcription **never blocks** session finalization. If Whisper fails, the session is still saved; transcript stays empty.

---

## 1. Files to CREATE

| Path | Purpose |
|---|---|
| `docs/plans/m2-voice-photo-capture.md` | this file |
| `supabase/migrations/0002_m2_schema.sql` | `voice_transcriptions` table + `media_assets.quick_tag` column |
| `app/api/v1/media/[id]/complete/route.ts` | `POST` — flip `media_assets.upload_status` `pending`→`uploaded`, optionally set `file_size_bytes` and `quick_tag` |
| `app/api/v1/media/[id]/transcribe/route.ts` | `POST` — insert `voice_transcriptions` row, kick off Whisper job via Next 16 `after()`, return 202 |
| `lib/whisper.ts` | server-only OpenAI client + `transcribeAudio(buffer, mimeType)` helper |
| `lib/api/media.ts` | client-side upload pipeline helpers (mint URL → PUT → complete → optionally trigger transcribe) |
| `hooks/use-media-recorder.ts` | thin wrapper around `MediaRecorder` for the voice flow |
| `hooks/use-transcription-poll.ts` | polls `GET /api/v1/preflight-sessions/[id]` until transcript lands or timeout |
| `components/preflight/entry-choice.tsx` | 3-button picker: Voice / Photo / No Issues |
| `components/preflight/voice-recorder.tsx` | recording UI driven by `useMediaRecorder`; replaces scripted `TRANSCRIPT_LINES` flow |
| `components/preflight/photo-capture.tsx` | `<input type="file" accept="image/*" capture="environment">` + preview |
| `components/preflight/quick-tag-picker.tsx` | 5-button tag row + Skip |
| `components/preflight/confirmation.tsx` | "Preflight Logged" screen with timestamp / aircraft / status / summary / Done |

## 2. Files to MODIFY

| Path | Change |
|---|---|
| `package.json` / `pnpm-lock.yaml` | add `openai` SDK (only new dep; flag if anything else needed) |
| `lib/types/database.ts` | add `VoiceTranscription` type + `QuickTag` union + extend `MediaAsset` with `quick_tag`, extend `PreflightSessionWithMedia` with `voice_transcriptions[]` |
| `lib/api/sessions.ts` | extend the `useSessions()` and `getSession()` types to carry voice_transcriptions; expose a `getSessionForPolling(id)` helper |
| `lib/api/adapter.ts` | adapter handles new shape; transcript_text comes preferentially from session, then from latest voice_transcription |
| `app/api/v1/preflight-sessions/route.ts` | extend `GET` select to include `voice_transcriptions(*)` |
| `app/api/v1/preflight-sessions/[id]/route.ts` | same — include `voice_transcriptions(*)` join |
| `app/api/v1/media/upload-url/route.ts` | **(Q2 resolved — leaving untouched.)** `quick_tag` is set only at `complete` time. Single source of truth. No changes to this route. |
| `app/(app)/page.tsx` | rip out `TRANSCRIPT_LINES` + `setTimeout` chain + photo Yes/No dialog; orchestrate the new components in a state machine (idle → choosing → recording/capturing → uploading → confirming) |
| `.env.example` | add `OPENAI_API_KEY=` (server-only, no `NEXT_PUBLIC_*` prefix) with comment |
| `.env.local` | add `OPENAI_API_KEY=…` (locally — user will paste, never echoed) |
| `docs/plans/m1-supabase-integration.md` | append a one-line cross-ref: "M2 introduces `voice_transcriptions` and `media_assets.quick_tag`; see m2 plan for migration debt note." |

## 3. Files to DELETE — none

(`lib/mock-helpers.ts` stays; the `recentObservations` / `repeatedObservations` heuristic continues to power the Memory page until M3.)

---

## 4. Schema migration — `supabase/migrations/0002_m2_schema.sql`

> **Do not modify `0001_m1_schema.sql`.** Per the M1 debt notes, M4 will land `0002_m4_rls_policies.sql` which will renumber if needed. For M2 we keep going as `0002_m2_schema.sql` and let M4 sort the order. The user runs this in the Supabase SQL Editor; the agent does not auto-execute.

```sql
-- =====================================================================
-- Flight Recall — Milestone 2 schema
-- Adds: voice_transcriptions, media_assets.quick_tag
-- RLS:  intentionally NOT enabled (consistent with M1 debt; M4 fixes).
-- =====================================================================

-- One transcription row per audio media_asset. Status flips:
-- pending → processing → completed | failed.
create table public.voice_transcriptions (
  id                    uuid primary key default gen_random_uuid(),
  media_asset_id        uuid not null unique references public.media_assets(id) on delete cascade,
  preflight_session_id  uuid not null references public.preflight_sessions(id) on delete cascade,
  transcription_status  text not null default 'pending'
                              check (transcription_status in ('pending','processing','completed','failed')),
  transcript_text       text,
  language              text,
  duration_seconds      numeric,
  model                 text not null default 'gpt-4o-mini-transcribe',
  error_message         text,
  created_at            timestamptz not null default now(),
  started_at            timestamptz,
  completed_at          timestamptz
);

create index idx_voice_transcriptions_session_id
  on public.voice_transcriptions(preflight_session_id);
create index idx_voice_transcriptions_status
  on public.voice_transcriptions(transcription_status);

-- One-tap photo tag, M2-only shape. M3 will replace this with a FK to
-- a real issue_types table and migrate values. Constraint kept narrow
-- to catch typos; relaxing is easy in M3.
alter table public.media_assets
  add column quick_tag text
    check (quick_tag in ('scratch','dent','tire','oil','other'));
```

**M2-to-M3 migration debt (will go in the consolidated debt section as #7):**

`media_assets.quick_tag` is a flat text column with a 5-value enum check. M3 will introduce `public.issue_types` and `public.issues`, then run `0003_m3_issues.sql` to:
1. Populate `issue_types` with the five quick_tag values plus any new ones.
2. Backfill `issues` rows from each `media_assets.quick_tag` non-null value.
3. Drop the `quick_tag` column on `media_assets` and replace with a FK to `issues`.
4. Update photo-capture API to accept an `issue_type_id` instead of a string.

---

## 5. API routes — request/response shapes

### `POST /api/v1/media/[id]/complete`

Flips `media_assets.upload_status` from `pending` → `uploaded` after the client has successfully PUT the file to the signed URL. **Per Q7, when the row's `media_type='audio'`, this endpoint also fires the transcription job server-side** (insert `voice_transcriptions` row + schedule the Whisper call via `after()`). Client orchestration shrinks to: mint URL → PUT → complete.

```jsonc
// Request body (all optional)
{
  "file_size_bytes": 1024,
  "quick_tag": "tire" // photo only; 400 if media_type !== 'photo'
}

// 200 → { ...updated MediaAsset, voice_transcription_id?: "<uuid for audio>" }
// 404 → media not found
// 400 → invalid quick_tag for non-photo media, or zod failure
```

`quick_tag` is **only** accepted here (Q2). `upload-url` is not modified.

### `POST /api/v1/media/[id]/transcribe`

Kept as a directly callable endpoint (Q7: useful for retries in M3+) but **not on the M2 happy path** — `complete` triggers transcription automatically for audio. Same shape and same internal logic as below; the route just calls into the shared internal helper that `complete` also calls.

```jsonc
// Request body: empty
// 202 → { "status": "accepted", "voice_transcription_id": "<uuid>" }
// 404 → media not found
// 400 → media is not audio | upload_status is not 'uploaded' | already has a voice_transcription
// 500 → DB write to insert voice_transcriptions row failed (rare)
```

Server flow (shared with `complete` for audio):
1. Validate id is uuid; load `media_assets` row; require `media_type='audio'` and `upload_status='uploaded'`.
2. Insert `voice_transcriptions { media_asset_id, preflight_session_id, status='pending' }`. Return 202 with the new transcription id.
3. In `after()`:
   - Update `voice_transcriptions.{status='processing', started_at=now()}`.
   - Download the audio bytes from Storage (signed download URL minted server-side via `createSignedUrl`, then `fetch` of that URL — keeps the audio in memory; typical voice notes are 30-300 KB).
   - Call OpenAI `audio.transcriptions.create({ model: 'gpt-4o-mini-transcribe', file })`.
   - On success: update `voice_transcriptions` (`transcript_text`, `language`, `duration_seconds`, `status='completed'`, `completed_at`) AND update `preflight_sessions.transcript_text` with the same text (denormalized for fast read; UI can render off either).
   - On failure: update `voice_transcriptions { status='failed', error_message=<short>, completed_at }`. Never throws to the client (response is already sent).

### Modified `GET /api/v1/preflight-sessions/[id]` and list endpoint

Both extend the `select` to include `voice_transcriptions(*)`. Result shape:

```jsonc
{
  "id": "...",
  "aircraft_id": "...",
  "input_type": "voice",
  "transcript_text": "Oil residue under fuselage...",  // populated when Whisper finishes
  "media_assets": [...],
  "voice_transcriptions": [{
    "id": "...",
    "transcription_status": "completed",
    "transcript_text": "Oil residue under fuselage...",
    "completed_at": "...",
    "model": "gpt-4o-mini-transcribe",
    "error_message": null
  }],
  ...
}
```

The dashboard's polling hook reads `voice_transcriptions[0].transcription_status` and switches the UI when it hits `completed` or `failed`.

---

## 6. UI / component-level changes

### Dashboard state machine (`app/(app)/page.tsx`)

Replaces current `idle | listening | completed`:

```
idle
  ↓ tap "Start Preflight"
choosing                       ← shows EntryChoice (Voice / Photo / No Issues)
  ↓
recording   (voice)            ← VoiceRecorder + Orb in 'listening' state, real mic
capturing   (photo)            ← PhotoCapture + camera input
                                  ↓
                               (photo only) tagging ← QuickTagPicker
  ↓
uploading                       ← optimistic Confirmation skeleton; spinner
  ↓
confirming                      ← Confirmation populated; transcribe polling if voice
  ↓ tap "Done"
idle
```

### `components/preflight/voice-recorder.tsx`

- Uses `useMediaRecorder()` (new hook).
- Default mime: prefers `audio/webm;codecs=opus`, falls back to whatever `MediaRecorder.isTypeSupported` returns; we read the actual `recorder.mimeType` on stop and pass it through.
- On stop, returns a `Blob` to the parent. Parent runs the upload pipeline.

### `components/preflight/photo-capture.tsx`

- Renders `<input type="file" accept="image/*" capture="environment">`.
- On change, reads the `File`, generates an object-URL preview, parent shows preview + tag picker + Save button.

### `components/preflight/quick-tag-picker.tsx`

- 5 pill buttons + "Skip" — taps select one; tapping again deselects.
- No "Save" — parent owns when the upload kicks off (after preview confirm).

### `components/preflight/confirmation.tsx`

- Full-bleed card on top of the dashboard (not a separate route — see open Q1).
- Top: success checkmark + "Preflight Logged".
- Aircraft (`N739X`) · Timestamp (formatted) · Status pill (M2: green for `no_issues`, sky-blue for `voice`, sky-blue for `photo` — see open Q3).
- Summary section, conditional:
  - **voice:** transcript area with three sub-states (`pending|processing` → "Transcribing…" + spinner; `completed` → render text; `failed` → "Transcription unavailable; session saved.")
  - **photo:** thumbnail + tag pill (or "No tag")
  - **no_issues:** "All systems nominal."
- Done button → returns to `idle`. (Sessions list also gets the new row on the next visit; the optimistic prepend in `useSessions().addSession` keeps it visible there immediately.)

### Polling — `hooks/use-transcription-poll.ts`

```ts
useTranscriptionPoll(sessionId: string | null, opts?: { intervalMs?: number, maxAttempts?: number })
  → { status, transcript_text, attempts }
```

- Default interval: **2500 ms** (mid-range of brief's 2–3 s).
- Default max attempts: **24** (~60 s wall-clock).
- Stops as soon as the latest `voice_transcriptions[0].transcription_status` is `completed` or `failed`.
- On timeout: returns `status: 'timed_out'` — UI shows a soft "Transcription is taking longer than expected — check back later" line. Session stays saved.

---

## 7. OpenAI / Whisper integration

- Model: **`gpt-4o-mini-transcribe`** (per decision).
- SDK: `openai` (latest) — single new dep.
- Auth: `OPENAI_API_KEY` server-side env var. Already deployed to Vercel (Production/Preview/Dev) per user note. Locally the user will need to add it to `.env.local` before pushing real-mic curls.
- Server helper (`lib/whisper.ts`):

  ```ts
  import OpenAI from 'openai';
  const client = new OpenAI(); // reads OPENAI_API_KEY
  export async function transcribeAudio(buffer: Buffer, fileName: string): Promise<{ text, language?, duration? }> {
    const file = await OpenAI.toFile(buffer, fileName);
    const res = await client.audio.transcriptions.create({
      file,
      model: 'gpt-4o-mini-transcribe',
      response_format: 'json',
    });
    return { text: res.text, language: (res as any).language, duration: (res as any).duration };
  }
  ```

  (Verbose response_format with timestamps is overkill for M2 — text only; `gpt-4o-mini-transcribe` defaults to `json`.)

- Failure modes handled in the route, not the helper:
  - Network / 5xx from OpenAI → catch, mark `voice_transcriptions.status='failed'`, store first 500 chars of error in `error_message`, never crash the function.
  - Invalid audio format → same path, `failed`.
  - Vercel function lifetime exceeded → request gets killed; we never write `completed`. Polling will time out client-side and show the soft message. Acceptable for M2.

- **No retry, no exponential backoff in M2.** Failed transcriptions stay failed; M3+ may add a retry button.

---

## 8. Storage path conventions (audio)

Extends the M1 pattern verbatim:

```
sessions/<preflight_session_id>/audio/<media_asset_id>-<sanitized_file_name>.<ext>
```

- Sanitize same as M1: `[^a-zA-Z0-9._-]` → `_`, lowercase the extension.
- Default file name when MediaRecorder doesn't supply one: `voice-note.webm` (or `.mp4` on Safari).
- The existing `sanitizeFileName` helper in `app/api/v1/media/upload-url/route.ts` already covers this; no changes needed.

---

## 9. Polling strategy — exact specs

| Knob | Value | Rationale |
|---|---|---|
| Interval | 2500 ms | mid-range of brief's 2–3 s |
| Max attempts | 24 | ~60 s — well past the typical 5–10 s gpt-4o-mini-transcribe latency for ≤30 s audio |
| Trigger | starts immediately when Confirmation enters with `input_type='voice'` and a known `voice_transcription_id` |
| Stop conditions | `status` ∈ {`completed`, `failed`} OR `attempts >= max` |
| State surfaced | `pending` / `processing` → "Transcribing…", `completed` → text, `failed` → soft message, `timed_out` → soft message |
| Cleanup | on Done / unmount, abort in-flight fetch with AbortController |

Polling is the only async UI behavior; everything else (record, capture, upload, save, tag) is request/response.

---

## 10. Confirmation screen design (more detail)

- **Layout:** centered modal-like card on the dashboard, same `max-w-md` as the existing transcript panel; takes over the orb area when active so the eye doesn't have to track.
- **Visual:** green check (sky-blue if voice still transcribing), `text-2xl font-semibold` headline "Preflight Logged".
- **Metadata row:** Aircraft chip · timestamp · status pill (matches existing `Plane · date · N739X` pattern at the top of the dashboard).
- **Summary block:** sized to roughly 3 lines tall to avoid layout shift when transcript lands.
- **Done button:** primary-style, `Done` on idle paths, `Done · Transcript will arrive shortly` if still transcribing on dismissal (we keep polling in the background only if the user stays; if they tap Done while polling, polling stops — the transcript still completes server-side and shows next time they view the session).
- After Done, dashboard returns to `idle`. The new session is already in `useSessions().sessions` from the optimistic prepend, so the Sessions tab and Memory tab reflect it without extra fetches.

---

## 10b. Three resolved-with-additions items (post-approval)

### A. 60-second voice cap (resolves Q5 with mitigation)

`components/preflight/voice-recorder.tsx` enforces a hard **60-second max recording duration**:

- Visible elapsed-time counter from the moment recording starts.
- Last 10 seconds: counter switches to a countdown style (e.g., `5… 4… 3…`) with subtle color shift to amber.
- At 60 s exactly: recorder auto-stops and the parent state advances to upload as if the user tapped Stop.
- Eliminates the long-monologue Vercel-timeout edge case before it can happen. Anything past 60 s gets the same treatment as a manual stop.

Acceptance test addition: hold record for 65 s — recorder must auto-stop at 60 s, session must save, transcript must process.

This becomes M2 debt entry: *"Voice notes capped at 60 s in the UI; M3+ may extend if we move to a queue-based transcription pattern (e.g., Inngest, Trigger.dev, or a Postgres job table polled by a cron worker) where total wall-clock no longer matters."*

### B. Failed-transcript copy in sessions list

`app/(app)/sessions/page.tsx` already renders session cards via the adapter. Adapter additions:

- If a session's `voice_transcriptions[0].transcription_status === 'failed'` AND there's no other notes content, the card surfaces the line **"Transcription unavailable"** in the same slot where notes/observations would normally render. No icon-tier change; same muted treatment as a clean session.
- If status is `pending` / `processing`: card shows **"Transcribing…"** with a small pulse dot.
- If `completed`: card shows the transcript first line (truncated) as a normal note.
- If `timed_out`: same copy as `failed` from the user's POV (the session is saved; transcript may still arrive on a later view).

This is one branch added to `lib/api/adapter.ts::adaptSession()`; no new components.

### C. Polling cost as M2-to-M3 debt

Documenting under M2 debt: *"Voice transcription polling = 2.5 s × up to 24 attempts = up to 12 GETs to `/api/v1/preflight-sessions/[id]` per voice session while the user lingers on the Confirmation screen. M3+ should consider Supabase Realtime (one persistent subscription replaces the poll loop entirely) or shrink the poll cap once we have data on real Whisper latency. Acceptable cost for M2 demo volume."*

---

## 11. Open questions — RESOLVED

| Q | Resolution |
|---|---|
| Q1 — Confirmation as in-place state vs route | **In-place.** Single-screen flow; no auth → no shareability use case. |
| Q2 — `quick_tag` accepted at `complete` only | **Yes.** `upload-url` route stays untouched. |
| Q3 — M2 status_color mapping | **Default approved.** `no_issues→green`; `voice→null`; `photo→null` until M3 derives from issues. |
| Q4 — MediaRecorder mime drift | **Pass-through.** Critical: `file_name` extension must match the actual mime (e.g., `voice-note.mp4` on iOS, `voice-note.webm` on Chrome) so Whisper accepts it. Don't hardcode `.webm`. |
| Q5 — Vercel function-lifetime risk for long voice notes | **Resolved by §10b.A.** 60-second UI cap eliminates the edge case. |
| Q6 — `OPENAI_API_KEY` in `.env.local` | User will add before local curls. Never pasted to chat. |
| Q7 — `complete` auto-triggers `transcribe` for audio | **Yes.** Server-side coordination. `/transcribe` route still exists (callable for retries in M3+) and shares the same internal helper.

_(All seven resolved — see the table immediately above.)_

---

## 12. Acceptance test plan

### Local curl pass (after migration applied + OPENAI_API_KEY in .env.local)

```
1. POST /api/v1/preflight-sessions  {aircraft_id, input_type:'voice'}                     → 201
2. POST /api/v1/media/upload-url    {session_id, media_type:'audio',
                                     file_name:'probe.webm', mime_type:'audio/webm'}      → 201 + signed_url
3. PUT  <signed_url>                <real-or-synthetic small audio>                       → 200
4. POST /api/v1/media/[id]/complete {file_size_bytes}                                     → 200
5. POST /api/v1/media/[id]/transcribe                                                     → 202 + voice_transcription_id
6. Loop GET /api/v1/preflight-sessions/[id] every 2.5s until
       voice_transcriptions[0].transcription_status === 'completed' or 'failed'
                                                                                          → eventually completed
7. Photo flow:
   a. POST /api/v1/preflight-sessions {input_type:'photo'}
   b. POST /api/v1/media/upload-url   {media_type:'photo', file_name:'shot.jpg', mime:'image/jpeg'}
   c. PUT image                                                                           → 200
   d. POST /api/v1/media/[id]/complete {quick_tag:'tire'}                                 → 200
   e. GET session → media_assets[0].quick_tag === 'tire', upload_status === 'uploaded'
8. M1 backward compat: re-run M1 curls 1–4. Still pass.
```

### Browser tests (real mobile device)

- iPhone Safari: voice flow end-to-end, transcript visible within ~10 s.
- Android Chrome: same.
- Desktop: file picker fallback for photo; mic still records.
- Airplane-mode: record voice → see "Saved" confirmation but transcription times out → confirmation shows soft failure copy → session row exists in DB with no transcript.
- **60-second cap (per §10b.A):** hold record for 65 s → recorder auto-stops at 60 s, last 10 s show countdown, session saves, transcript processes normally.
- **Failed-transcript card copy (per §10b.B):** sessions list card shows "Transcription unavailable" / "Transcribing…" / first-line transcript depending on status.
- Done from Confirmation → dashboard back to idle → /sessions shows the new row.

### Build / type / lint

- `pnpm tsc --noEmit` exits 0 with strict mode + `ignoreBuildErrors:false`.
- `next build` succeeds (no new deps trigger version conflicts; only `openai` added).

---

## 13. Hard stops (in order)

1. **After this plan is written** — wait for user review + answers to the 7 open questions. *(this turn ends here)*
2. **After writing `0002_m2_schema.sql`** — wait for user to apply via Supabase SQL Editor. Do not write API routes that reference `voice_transcriptions` until confirmed.
3. ~~Before pushing to main, ONLY if `OPENAI_API_KEY` not yet set in Vercel.~~ → **N/A — user confirmed it's already deployed to Vercel.** Push will proceed without an explicit env-var stop.
4. **If anything in production verification fails differently than local** — stop, surface, do not thrash.

---

## STOP — STATUS

Plan approved 2026-04-25 with all 7 questions resolved + three additions (§10b.A/B/C). Next action: write `supabase/migrations/0002_m2_schema.sql` and stop for user to apply via Supabase SQL Editor. Will NOT write any code referencing `voice_transcriptions` until the user replies `migration applied`.
