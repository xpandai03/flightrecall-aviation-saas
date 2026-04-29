# M4 Bugfix — Voice Flow Manual Issue Tagging

Mirror the photo flow's `quick_tag` pattern in voice. After recording stops,
show the same 5-pill picker (scratch / dent / tire / oil / other) + Skip.
Tag → issue created/updated and linked. Skip → transcript saved, no issue.
When the async Whisper transcript lands, populate the linked issue's
`description` with the transcript text.

---

## 1. Files — CREATE / MODIFY / DELETE

### CREATE
- _none_

### MODIFY
1. `app/(app)/aircraft/[id]/preflight/page.tsx` — add `voice_tagging` step to
   the state machine, render `<QuickTagPicker>` between recording-stopped and
   `uploading`, pass selected tag through `uploadMedia`.
   - **NOTE:** The prompt referenced `app/(app)/aircraft/[id]/dashboard/page.tsx`,
     but that file is now a server-only dashboard view. Commit `d7b6a24`
     (`feat: restructure dashboard + move logging to /preflight`) moved the
     voice/photo state machine into `preflight/page.tsx`. Confirmed by reading
     both files. Targeting the actual location.
2. `components/preflight/quick-tag-picker.tsx` — add a `mode` (or `kind`) prop
   so the heading swaps between "Tag this photo" and "Tag this voice note".
   The 5 pill values, behavior, and styling stay identical — just the copy
   differs. Approach (c) from the Adaptation section.
3. `app/api/v1/media/[id]/complete/route.ts` —
   (a) drop the hard guard at lines 152–160 that 400s when `quick_tag` is sent
       for non-photo media (it currently rejects audio + tag),
   (b) extend the auto-issue branch at line 191 from
       `media_type === "photo"` to `(media_type === "photo" || media_type === "audio")`,
   (c) rename `upsertIssueForPhoto` → `upsertIssueForMedia` (cosmetic, no
       behavior change — the function is media-type-agnostic internally).
4. `lib/transcription-job.ts` — inside `runTranscription`'s success branch,
   after writing transcript_text to `voice_transcriptions` and `preflight_sessions`,
   fetch the linked `media_assets.issue_id`. If non-null AND the issue's
   `description` is currently null, UPDATE `issues.description` with the first
   500 chars of the transcript. Best-effort: failures log but don't fail the
   transcription job.
5. `lib/api/media.ts` — **already passes `quick_tag` through** (see
   `uploadMedia` arg at line 47). No client-side change needed; the voice
   call site in `preflight/page.tsx` simply hasn't been passing it yet.
   Will pass it when `voice_tagging` step finishes.

### DELETE
- _none_

---

## 2. Voice flow state machine change

**Current** (in `app/(app)/aircraft/[id]/preflight/page.tsx`):

```
idle → recording → uploading → confirming → idle
```

The `Step` discriminated union currently has no voice-tagging step.
`handleVoiceComplete(result)` is called by `<VoiceRecorder>` and goes
straight `recording → uploading → confirming`.

**New:**

```
idle → recording → voice_tagging → uploading → confirming → idle
```

### Concrete edits

Add a new variant to the `Step` union (around line 42-61):

```ts
| {
    kind: "voice_tagging";
    blob: Blob;
    mimeType: string;
    quickTag: QuickTag | null;
  }
```

Split `handleVoiceComplete` into two halves:

- **`handleVoiceCompleteFromRecorder(result: RecorderResult)`** — invoked by
  `<VoiceRecorder onComplete>`. Transitions
  `recording → voice_tagging` with `{ blob: result.blob, mimeType: result.mimeType, quickTag: null }`.
  Does NOT create the session or upload yet.
- **`handleVoiceSave()`** — invoked by `<QuickTagPicker onSave>` while in
  `voice_tagging`. Reads `step.blob`, `step.mimeType`, `step.quickTag`, runs
  the existing `createSession` + `uploadMedia` block (the body that today
  lives in `handleVoiceComplete`), passing `quick_tag: step.quickTag ?? undefined`
  through `uploadMedia`. Same toast + same transition to `confirming`.

Render block: insert after the `recording` block (around line 312):

```tsx
{step.kind === "voice_tagging" && (
  <QuickTagPicker
    mode="voice"
    value={step.quickTag}
    onChange={(next) =>
      setStep((prev) =>
        prev.kind === "voice_tagging" ? { ...prev, quickTag: next } : prev,
      )
    }
    onSave={handleVoiceSave}
    onCancel={reset}
  />
)}
```

No preview thumbnail — voice has nothing visual to preview. Just the picker.

`revokePreviewUrls` does not need updating — `voice_tagging` holds a `Blob`,
not an object URL. The blob is GC'd when the step transitions away.

### Trigger summary
- `recording → voice_tagging`: pilot stops recording (existing
  `<VoiceRecorder onComplete>` callback).
- `voice_tagging → uploading`: pilot taps a pill (or doesn't) then taps
  Save. `Skip` is implicit — `value: null` + Save = upload without tag.
- `voice_tagging → idle`: pilot taps Cancel.

---

## 3. `<QuickTagPicker>` reuse

The component is largely reusable as-is. Only the heading copy is photo-specific
(line 30: "Tag this photo"). Adding a `mode` prop:

```ts
mode?: "photo" | "voice";
```

Default `"photo"` to keep the existing call site behavior identical (no risk
of accidentally regressing the photo flow). When `mode === "voice"`, render
"Tag this voice note" instead. The subhead, pills, button copy, layout,
saving state — all identical.

Lean reason: trivial copy variant via prop is the cleanest of the three
options the prompt listed. Duplicating the file would invite drift; a copy
constant ladder inside a single component is two lines.

---

## 4. `complete` route logic

### Current (relevant excerpts)

```ts
// route.ts:152-160 — REJECTS audio+tag combinations
if (
  parsed.data.quick_tag !== undefined &&
  existing.media_type !== "photo"
) {
  return NextResponse.json(
    { error: "quick_tag is only valid for photo media" },
    { status: 400 },
  );
}

// route.ts:190-207 — auto-issue only for photo
if (
  updated.media_type === "photo" &&
  effectiveQuickTag &&
  !updated.issue_id
) {
  const issueResult = await upsertIssueForPhoto({ ... });
  ...
}
```

### After

```ts
// Drop the rejection block entirely. quick_tag is now valid for both
// photo and audio. The schema-level enum (route.ts:101) already restricts
// values to the 5 allowed slugs.

// Auto-issue branch — accept either media type
if (
  (updated.media_type === "photo" || updated.media_type === "audio") &&
  effectiveQuickTag &&
  !updated.issue_id
) {
  const issueResult = await upsertIssueForMedia({
    supabase,
    media_asset_id: updated.id,
    preflight_session_id: updated.preflight_session_id,
    quick_tag: effectiveQuickTag,
  });
  ...
}
```

The audio transcription branch (route.ts:209-240) is unchanged — it runs
in addition to (not instead of) the auto-issue logic, which is exactly what
we want: the issue is created synchronously on the `complete` response;
transcription proceeds in `after()` independently.

`upsertIssueForPhoto` is renamed to `upsertIssueForMedia`. Its body is
already media-type-agnostic — the function only needs `media_asset_id`,
`preflight_session_id`, and `quick_tag`. No internal logic change.

---

## 5. `issues.description` population

### Why it can't happen at `complete` time
The `complete` route is the request that creates the issue. At that
moment the Whisper transcript does not exist yet — transcription runs
in `after()` after the response is sent, takes ~5–15s, and writes
`transcript_text` to `voice_transcriptions` and `preflight_sessions`.

So at issue-creation time, `description` is left null (status quo for
photo-created issues; this matches existing behavior).

### Where transcript_text comes from when it lands
`runTranscription` in `lib/transcription-job.ts` already writes:
- `voice_transcriptions.transcript_text`
- `preflight_sessions.transcript_text`

We add a third write: `issues.description`, conditional on the linked
media_asset having an `issue_id`.

### Concrete edit to `runTranscription`

After the existing two UPDATE statements (lines 122–137), add:

```ts
// If this audio media was tagged at upload time, the issue row exists
// but its description is still null. Fill it now from the transcript.
const { data: media } = await supabase
  .from("media_assets")
  .select("issue_id")
  .eq("id", media_asset_id_from_voice_transcriptions_row)
  .maybeSingle();

if (media?.issue_id) {
  await supabase
    .from("issues")
    .update({ description: result.text.slice(0, 500) })
    .eq("id", media.issue_id)
    .is("description", null); // best-effort: don't overwrite manual edits
}
```

**Subtlety the prompt's Adaptation section flagged:** `runTranscription`
takes `voice_transcription_id` but **not** `media_asset_id`. Two options:

(a) Add a SELECT to fetch `media_asset_id` from the `voice_transcriptions`
    row at the top of the success branch. One extra round-trip. Cheap.
(b) Change `runTranscription`'s `RunArgs` to also accept `media_asset_id`
    and pass it from the `complete` route's `after()` call.

Option (b) is cleaner — the caller already has it (`updated.id`). Going
with (b). Diff is one new field on `RunArgs`, one extra arg at the
`after()` call site in `complete/route.ts:230-237`.

### What if the user typed Skip (no tag)?
Then `media_assets.issue_id` is null, the SELECT returns no `issue_id`,
the issues UPDATE is skipped. Transcript still lands on the session as
today.

### What if transcription fails?
The catch block stays unchanged. No description update is attempted on
failure paths. The issue stays with `description: null`, unchanged.

### What about the photo flow?
Photo media has no transcription path, so `runTranscription` is never
invoked for them. Description stays null for photo-created issues.
Unchanged.

---

## 6. Open questions

1. **`issues.description` column existence + length.** The prompt
   assumes `issues.description` exists as a nullable text column.
   Need to verify against `lib/types/supabase-generated.ts` (or a quick
   `\d issues` if I had DB access). If the column doesn't exist, this
   becomes a schema-touching task and we have to escalate — the prompt
   says no schema changes. **Surfacing for confirmation before starting
   implementation.**

2. **First 500 chars vs. full text.** Prompt says "transcript (or first
   500 chars)". Going with 500-char truncation to keep description
   bounded and make UI rendering predictable. Confirm — or specify
   different cap.

3. **Re-tagging behavior.** If a pilot voice-tags `oil` and the existing
   oil issue already has a description from a prior voice note, do we
   overwrite? The plan above guards `.is("description", null)` so we
   never overwrite — the first description sticks. Confirm this is the
   desired behavior, or whether the most recent voice note should
   "win" the description slot.

---

## 7. Acceptance test plan

Run after deploy. All against `https://flightrecall-aviation-saas.vercel.app`
(production) and locally.

### A — Tag pill creates issue + carry-forward shows it
1. Aircraft with no active oil issue. Open `/aircraft/<id>/preflight`.
2. Tap Voice → speak "oil under the wing for 15 seconds" → Stop.
3. Picker appears. Tap **Oil** → tap **Save with tag**.
4. Confirmation screen shows; transcribing indicator works as before.
5. Navigate to `/aircraft/<id>/dashboard`.
6. Active issues list shows **Oil — Seen 1 flight ago**.
7. Status chip color reflects new active issue count.
8. Direct DB check (or via `/api/v1/aircraft/<id>/active-issues`):
   - One `issues` row, `issue_type.slug='oil'`, `current_status='active'`,
     `aircraft_id=<id>`.
   - One `issue_observations` row, `action='logged'`, linked to the new
     `preflight_session_id`.
   - `media_assets.issue_id` matches the new issue row.

### B — Skip creates no issue
1. Same aircraft. Open preflight, tap Voice → record → Stop.
2. Picker appears. **Don't tap any pill.** Tap **Save without tag**.
3. Confirmation screen shows.
4. Active issues list unchanged from before.
5. No new `issues` row; new `media_assets` row has `issue_id=null` and
   `quick_tag=null`.

### C — Transcript backfills description
1. Run scenario A. Note the issue id.
2. Wait ~10–15s for Whisper to land.
3. Re-fetch issue (via REST or direct DB):
   `issues.description` is non-null and is the first 500 chars of the
   transcript "oil under the wing…".
4. For scenario B's session, the linked media has no issue_id, so
   nothing to update — verify nothing was inadvertently written to
   another issue's description.

### D — Re-activation
1. Mark the oil issue Fixed via carry-forward on the next session.
2. Confirm `current_status='resolved'` and `resolved_at` set.
3. Record another voice note → Oil → Save.
4. Same `issues` row reactivates: `current_status='active'`,
   `resolved_at=null`, `last_seen_at` updated. (Existing logic at
   route.ts:43-57 handles this; we're verifying we didn't break it.)

### E — Carry-forward across input types
1. From scenario A, on next session, tap **Still** on the oil item.
2. `issue_observations` gets a `still` row; `last_seen_at` advances.
   Carry-forward keeps showing it.

### F — Photo regression
1. Tap Photo → capture → tap Dent → Save.
2. Existing flow still works: dent issue created, status color updates,
   carry-forward on next session shows it.

### G — Type & build
1. `pnpm tsc --noEmit` clean.
2. `pnpm build` clean.

### H — Existing M1–M4 acceptance (smoke)
1. Sign in/out, aircraft scoping, no_issues with mandatory checklist
   photo, sessions list — all behave as before.

---

STOP — confirm with user before proceeding.
