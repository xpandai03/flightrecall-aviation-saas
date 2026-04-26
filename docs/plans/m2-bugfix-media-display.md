# M2 Bug Fix — Media Display in Session Detail Sheet

**Owner:** senior FS engineer
**Type:** post-M2 bug fix, **not** a new milestone
**Date:** 2026-04-25
**Predecessors:** M1 (`docs/plans/m1-supabase-integration.md`), M2 (`docs/plans/m2-voice-photo-capture.md`)

---

## Problem (one paragraph)

Real-device test surfaced that uploaded media is invisible in the UI. The data is correct in Postgres (`media_assets` rows with real `storage_key` / `mime_type` / `quick_tag`) and in Storage (private `flight-recall-media` bucket). But the session-detail `<Sheet>` in `app/(app)/sessions/page.tsx` was not updated when M1's mock data was replaced — it still expects the legacy `Session.photos: string[]` shape and renders **fake gradient placeholder tiles** (sky-blue squares with a rotated `<Plane>` icon) regardless of what was actually uploaded. There is no `<audio>` element anywhere — voice sessions show transcript text only. Bucket is private (correctly); browser cannot load assets without server-minted signed read URLs.

---

## Objective

Open the live app, log a photo session with a tag, open `/sessions`, tap the session — see the actual photo + the tag pill. Same for voice: log a voice session, open it, tap play, hear what was recorded. Nothing more.

---

## Files to CREATE

| Path | Purpose |
|---|---|
| `docs/plans/m2-bugfix-media-display.md` | this file |

## Files to MODIFY

| Path | Change |
|---|---|
| `lib/types/database.ts` | add `MediaAssetWithSignedUrl` (= `MediaAsset & { signed_url: string \| null }`) and `PreflightSessionDetail` (the shape returned by the per-id GET, with the signed-URL flavor of media_assets). Existing `MediaAsset` and `PreflightSessionWithMedia` stay as-is to keep the DB-shape clean and the list endpoint untouched. |
| `app/api/v1/preflight-sessions/[id]/route.ts` | after the existing select, run `createSignedUrl(asset.storage_key, 3600)` per asset in parallel via `Promise.all`. On per-asset failure, log to server console and set `signed_url: null` on that asset. Whole-response failure paths are unchanged. Response type becomes `PreflightSessionDetail`. |
| `lib/api/sessions.ts` | change `getSession()` return type to `Promise<PreflightSessionDetail>`. No runtime change. |
| `hooks/use-transcription-poll.ts` | the poll hook calls `getSession(id)` — `media_assets` shape now carries `signed_url`, but the hook only reads `voice_transcriptions[0].transcription_status` / `transcript_text`, so it's a structural-compatibility check, not a logic change. |
| `app/(app)/sessions/page.tsx` | when the Sheet opens, fetch detail via `getSession(active.id)`; while loading, show a skeleton; when loaded, render real `<img src={signed_url}>` for photos and `<audio controls src={signed_url}>` for audio. Photo cards show the `quick_tag` pill if set. If `signed_url === null` for an asset, render a small "Unavailable" tile/badge. The Sheet's static parts (aircraft/date/notes) keep rendering from the existing `Session` view-model so they appear instantly. |

## Files to DELETE — none

## Schema changes — none. No migration needed for this bug fix.

---

## API change — `GET /api/v1/preflight-sessions/[id]`

### Current response shape (M2)

```ts
PreflightSessionWithMedia = PreflightSession & {
  media_assets: MediaAsset[];          // no signed_url
  voice_transcriptions: VoiceTranscription[];
}
```

### New response shape

```ts
MediaAssetWithSignedUrl = MediaAsset & { signed_url: string | null };

PreflightSessionDetail = PreflightSession & {
  media_assets: MediaAssetWithSignedUrl[];
  voice_transcriptions: VoiceTranscription[];
};
```

### Server flow (sketch — not committed yet)

```ts
const BUCKET = "flight-recall-media";
const SIGNED_URL_TTL_SECONDS = 3600;

const { data, error } = await supabase
  .from("preflight_sessions")
  .select("*, media_assets(*), voice_transcriptions(*)")
  .eq("id", parsed.data)
  .maybeSingle();

if (error) return NextResponse.json({ error: error.message }, { status: 500 });
if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

const media_assets = await Promise.all(
  (data.media_assets ?? []).map(async (asset) => {
    const { data: signed, error: signedErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(asset.storage_key, SIGNED_URL_TTL_SECONDS);
    if (signedErr || !signed?.signedUrl) {
      console.error("signed URL mint failed", {
        asset_id: asset.id,
        storage_key: asset.storage_key,
        error: signedErr?.message,
      });
      return { ...asset, signed_url: null };
    }
    return { ...asset, signed_url: signed.signedUrl };
  })
);

return NextResponse.json({ ...data, media_assets });
```

### What does NOT change

- `GET /api/v1/preflight-sessions` (list endpoint). The list view in `/sessions` shows photo *counts*, not thumbnails, so list doesn't need signed URLs. Keeping the list cheap (no per-row Storage round-trips) matters once we have many sessions.
- `POST /api/v1/preflight-sessions`, `POST /api/v1/media/upload-url`, `POST /api/v1/media/[id]/complete`, `POST /api/v1/media/[id]/transcribe`. Untouched.
- The `voice_transcriptions` join. Audio playback uses the corresponding `media_assets` row, not the transcription row.
- Storage bucket settings or policies. Bucket stays private.

---

## Frontend change — `app/(app)/sessions/page.tsx`

### Current shape (relevant excerpts)

- `useSessions()` provides `sessions: Session[]` (legacy view-model from the adapter).
- Page-level state `active: Session | null` tracks which card is open in the Sheet.
- `<SessionDetail session={active} />` reads `session.photos: string[]` and renders fake gradient tiles.
- No audio rendering anywhere.

### New flow

1. User taps a card → `setActive(session)` (unchanged).
2. **New:** when `active.id` changes, a `useEffect` fires `getSession(active.id)` and stores the result in `detail: PreflightSessionDetail | null` local state. `loading: boolean` tracks the in-flight fetch.
3. The Sheet's static blocks (aircraft pill, date, repeat-finding warning, findings list) keep rendering from `active` (legacy view-model) so they appear immediately without a fetch wait.
4. The new "Photos" and "Audio" sections render from `detail.media_assets`:
   - Loading: a small skeleton tile / placeholder bar.
   - Loaded, photos:
     ```tsx
     <img src={asset.signed_url} alt={asset.file_name ?? 'Preflight photo'}
          className="w-full h-full object-cover" />
     ```
     If `signed_url === null`: render a small "Unavailable" tile (same dimensions, muted background).
     Below the image: small `<Badge>` with `quick_tag` if set, capitalized.
   - Loaded, audio:
     ```tsx
     <audio controls src={asset.signed_url ?? undefined}
            className="w-full" preload="metadata" />
     ```
     If `signed_url === null`: render a small "Audio unavailable" line.
5. When the Sheet closes, both `active` and `detail` reset; next open re-fetches (signed URLs expire on a 1-hour clock anyway).

### Adapter — leaving it alone

The legacy view-model `Session.photos: string[]` field is no longer the source of truth for image rendering — but it's still used for the *count* on the list cards (`session.photos.length`) and the camera-icon meta row. That's fine; storage_keys serve as well as anything for length-counting. **No adapter changes.**

---

## Type extensions — `lib/types/database.ts`

```ts
export type MediaAssetWithSignedUrl = MediaAsset & {
  signed_url: string | null;
};

export type PreflightSessionDetail = PreflightSession & {
  media_assets: MediaAssetWithSignedUrl[];
  voice_transcriptions: VoiceTranscription[];
};
```

`MediaAsset` and `PreflightSessionWithMedia` stay untouched — the list endpoint and the optimistic-paths in `useSessions` continue to work without `signed_url`.

---

## Open questions

1. **Should the audio's `<audio>` element use `preload="metadata"` (load just enough to know duration + show controls) or `preload="none"` (no fetch until user hits play)?** Default plan: `metadata`. Cost: a small range-request per voice session you open. Benefit: the play head shows the right duration. If `none` is preferred (e.g., to avoid Storage egress on session preview), say so.
2. **Photo aspect ratio in the Sheet — square (current placeholder behavior) or natural?** The current placeholder is 3-column `aspect-square` grid. Real photos may not be square. Default plan: keep `aspect-square` + `object-cover` so layout doesn't shift; users see a centered crop. If you'd rather see the full photo (`object-contain` + variable height), say so. (Out of scope: lightbox / fullscreen.)
3. **Should the existing list-page photo *count* badge stay storage_key-derived, or should we also surface a single thumbnail on the list card?** Default plan: leave the list card alone (count only, no thumbnail) since (a) it's not in scope, (b) thumbnails on the list would require signed URLs in the list response, and (c) the current count badge already conveys "photo attached." Flagging because the brief left it open ("if list view shows thumbnails today; otherwise skip").

---

## Acceptance test plan

### Curl-level

1. With a session that has one photo + one audio:
   - `GET /api/v1/preflight-sessions/<id>` → 200 with `media_assets[0].signed_url` matching `https://wmarlpurrvdlvkndsgez.supabase.co/storage/v1/object/sign/flight-recall-media/sessions/.../photo/...?token=…`.
2. `curl -I` (HEAD) the photo's `signed_url` → `200`, `Content-Type: image/jpeg` (or whatever the original mime was).
3. Same for the audio's `signed_url` → `200`, `Content-Type: audio/webm` (or the iOS `audio/mp4` flavor).
4. Failure path: temporarily UPDATE one media_asset's `storage_key` to a bogus value via SQL (or use an asset whose key was misspelled). `GET /api/v1/preflight-sessions/<id>` → 200, the bad asset has `signed_url: null`, the *other* assets in the same session still have valid URLs. **Server log shows the per-asset error** (do not rely on the client response to surface it). Revert the SQL after.
5. M1 + M2 unchanged routes (`GET /aircraft`, `POST /preflight-sessions`, `POST /media/upload-url`, `POST /media/[id]/complete`, `POST /media/[id]/transcribe`) all still pass.

### Browser-level

1. On the live URL, open `/sessions`. Tap the most recent voice session. Confirm:
   - Sheet opens with aircraft + date + transcript visible immediately.
   - "Audio" section appears with an `<audio controls>` element.
   - Tapping play produces the recorded audio.
2. Tap the most recent photo session. Confirm:
   - Sheet opens; photo grid renders the actual JPEG.
   - `quick_tag` pill (e.g., "tire") appears beside / below the photo.
3. Open a session with both audio and photos (created during this fix's verification): both elements render.
4. With DevTools network tab open, confirm signed URLs are 1-hour TTL (no surprises in `?token=…&expiresAt=…` if exposed) and that they 200 directly from `wmarlpurrvdlvkndsgez.supabase.co`.

### Build / typecheck

- `pnpm tsc --noEmit` → exit 0 with strict mode + `ignoreBuildErrors: false`.
- `next build` (Vercel) succeeds.

---

## Implementation order (after plan approval, no further hard stops)

1. Type extensions in `lib/types/database.ts`.
2. Server change in `app/api/v1/preflight-sessions/[id]/route.ts` (signed URL minting + response shape).
3. Client `getSession()` return type bump in `lib/api/sessions.ts`.
4. Sheet rendering update in `app/(app)/sessions/page.tsx` (effect on `active.id`, real `<img>` + `<audio>`, `signed_url: null` placeholder, `quick_tag` pill).
5. `pnpm tsc --noEmit`.
6. Local browser smoke (desktop): create a photo session, confirm rendering; create a voice session, confirm playback.
7. Commit in 2 chunks (logical split): `fix: server signed URLs in session detail` + `fix: render real photos and audio in detail sheet`.
8. Push to `main`. Vercel auto-deploys (~90s).
9. Production curl pass for points 1–5 above.
10. Final report. Real-device phone test deferred to user.

---

## STOP — confirm with user before proceeding

Approve or override:

1. **Plan structure** — file list, server flow, frontend approach.
2. **Open question 1** — `preload="metadata"` vs `"none"`.
3. **Open question 2** — `aspect-square / object-cover` vs natural aspect.
4. **Open question 3** — list-card thumbnails (default: leave alone).

Or just say "go with defaults" and I'll execute. No more planning rounds after this.
