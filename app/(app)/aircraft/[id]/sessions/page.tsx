"use client"

import * as React from "react"
import { Suspense } from "react"
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronRight,
  FileText,
  ImageOff,
  Mic,
  Plane,
} from "lucide-react"

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { EditableTranscript } from "@/components/editable-transcript"
import { PhotoLightbox } from "@/components/photo-lightbox"
import { StatusChip } from "@/components/status-chip"
import { adaptSession } from "@/lib/api/adapter"
import { getSession, listAircraft, useSessions } from "@/lib/api/sessions"
import {
  isCompanionPhotoVoiceAudio,
  isPhotoAttachedTranscript,
} from "@/lib/media-attachment-filters"
import type { Session } from "@/lib/mock-helpers"
import type {
  MediaAssetWithSignedUrl,
  PreflightSessionDetail,
  PreflightSessionWithMedia,
  StatusColor,
  VoiceTranscription,
} from "@/lib/types/database"

export default function SessionsPage() {
  return (
    <Suspense
      fallback={
        <div className="text-sm text-muted-foreground py-8">Loading sessions…</div>
      }
    >
      <SessionsPageContent />
    </Suspense>
  )
}

function SessionsPageContent() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { sessions } = useSessions(params.id)
  const [active, setActive] = React.useState<Session | null>(null)

  const sessionParam = searchParams.get("session")
  const deepLinkHandled = React.useRef<string | null>(null)

  React.useEffect(() => {
    if (!sessionParam) {
      deepLinkHandled.current = null
      return
    }

    const fromList = sessions.find((s) => s.id === sessionParam)
    if (fromList) {
      if (deepLinkHandled.current !== sessionParam) {
        setActive(fromList)
        deepLinkHandled.current = sessionParam
        router.replace(pathname, { scroll: false })
      }
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const [acft, detail] = await Promise.all([
          listAircraft(),
          getSession(sessionParam),
        ])
        if (cancelled) return
        const row = detail as unknown as PreflightSessionWithMedia
        const s = adaptSession(row, acft, [row])
        setActive(s)
        deepLinkHandled.current = sessionParam
        router.replace(pathname, { scroll: false })
      } catch {
        deepLinkHandled.current = sessionParam
      }
    })()

    return () => {
      cancelled = true
    }
  }, [sessionParam, sessions, router, pathname])

  const onSheetOpenChange = React.useCallback(
    (open: boolean) => {
      if (!open) {
        setActive(null)
        if (searchParams.get("session")) {
          router.replace(pathname, { scroll: false })
        }
      }
    },
    [router, pathname, searchParams],
  )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sessions</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Every preflight note, searchable and persistent.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sessions.map((s) => (
          <SessionCard key={s.id} session={s} onOpen={() => setActive(s)} />
        ))}
      </div>

      <Sheet open={!!active} onOpenChange={onSheetOpenChange}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          {active && <SessionDetail session={active} />}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function SessionCard({ session, onOpen }: { session: Session; onOpen: () => void }) {
  const issueCount = session.notes.filter(
    (n) => !n.text.toLowerCase().includes("no issues"),
  ).length
  const clean = issueCount === 0

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group text-left rounded-xl border border-border/70 bg-card p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 hover:border-sky-200"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
            <Plane className="size-4 -rotate-45" />
          </span>
          <div>
            <div className="text-sm font-semibold tracking-tight">{session.aircraft}</div>
            <div className="text-xs text-muted-foreground">{session.date}</div>
          </div>
        </div>
        <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>

      <div className="mt-4 space-y-1.5">
        {session.notes.slice(0, 2).map((n, i) => (
          <div key={i} className="flex items-start gap-2 text-sm">
            {clean ? (
              <CheckCircle2 className="size-3.5 text-emerald-500 mt-1 shrink-0" />
            ) : (
              <span className="mt-1.5 size-1.5 rounded-full bg-amber-500 shrink-0" />
            )}
            <span className="text-foreground/80 line-clamp-1">{n.text}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
        <StatusChip
          color={session.statusColor}
          label={statusLabel(session.statusColor, clean, issueCount)}
        />
        {session.photos.length > 0 && (
          <span className="inline-flex items-center gap-1">
            <Camera className="size-3" />
            {session.photos.length}
          </span>
        )}
        {session.repeatedFlags.length > 0 && (
          <span className="inline-flex items-center gap-1 text-amber-600">
            <AlertTriangle className="size-3" />
            Repeat
          </span>
        )}
      </div>
    </button>
  )
}

function SessionDetail({ session }: { session: Session }) {
  const clean = session.notes.every((n) => n.text.toLowerCase().includes("no issues"))

  const [detail, setDetail] = React.useState<PreflightSessionDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = React.useState(false)
  const [detailError, setDetailError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    setLoadingDetail(true)
    setDetailError(null)
    setDetail(null)
    getSession(session.id)
      .then((d) => {
        if (cancelled) return
        setDetail(d)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setDetailError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (cancelled) return
        setLoadingDetail(false)
      })
    return () => {
      cancelled = true
    }
  }, [session.id])

  const photoAssets = (detail?.media_assets ?? []).filter(
    (a) => a.media_type === "photo",
  );
  const allMedia = detail?.media_assets ?? [];
  const allTranscripts = detail?.voice_transcriptions ?? [];
  const filterRows = allMedia.map((m) => ({
    id: m.id,
    media_type: m.media_type,
    voice_transcription_id: m.voice_transcription_id ?? null,
  }));
  const transcriptRows = allTranscripts.map((t) => ({
    id: t.id,
    media_asset_id: t.media_asset_id,
  }));
  const audioAssets = allMedia.filter(
    (a) =>
      a.media_type === "audio" &&
      !isCompanionPhotoVoiceAudio(a.id, filterRows, transcriptRows),
  );
  const editableTranscripts = (detail?.voice_transcriptions ?? []).filter(
    (t) =>
      t.transcription_status === "completed" &&
      t.transcript_text !== null &&
      !isPhotoAttachedTranscript(t.id, filterRows),
  );

  return (
    <>
      <SheetHeader>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Plane className="size-3 -rotate-45" />
          {session.aircraft} · {session.date}
        </div>
        <SheetTitle className="text-xl">Preflight report</SheetTitle>
        <SheetDescription>
          Captured via voice. Transcribed and filed to session memory.
        </SheetDescription>
      </SheetHeader>

      <div className="px-4 pb-4 space-y-5">
        {session.repeatedFlags.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-sm text-amber-900">
            <AlertTriangle className="size-4 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">Repeat finding</div>
              <div className="text-xs text-amber-800/80">
                {session.repeatedFlags.join(", ")} has been noted in a prior session.
              </div>
            </div>
          </div>
        )}

        <section>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
            Findings
          </div>
          <ul className="space-y-2">
            {session.notes.map((n, i) => (
              <li
                key={i}
                className="flex items-start gap-3 rounded-lg border border-border/60 bg-card px-3 py-2.5"
              >
                {clean ? (
                  <CheckCircle2 className="size-4 text-emerald-500 mt-0.5 shrink-0" />
                ) : (
                  <span className="mt-1.5 size-1.5 rounded-full bg-amber-500 shrink-0" />
                )}
                <div className="flex-1">
                  <div className="text-sm">{n.text}</div>
                  {n.timestamp && (
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {n.timestamp}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>

        {(loadingDetail || audioAssets.length > 0) && (
          <section>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
              Audio
            </div>
            {loadingDetail && audioAssets.length === 0 ? (
              <div className="h-12 rounded-lg bg-muted animate-pulse" />
            ) : (
              <ul className="space-y-2">
                {audioAssets.map((asset) => (
                  <li key={asset.id}>
                    <AudioPlayer asset={asset} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {editableTranscripts.length > 0 && (
          <section className="space-y-4">
            {editableTranscripts.map((tx) => (
              <EditableTranscript
                key={tx.id}
                transcriptionId={tx.id}
                initialText={tx.transcript_text ?? ""}
              />
            ))}
          </section>
        )}

        {detail && detail.issue_observations && detail.issue_observations.length > 0 && (
          <section>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
              Previous issue actions
            </div>
            <ul className="space-y-1.5">
              {detail.issue_observations.map((obs) => {
                // M4 Item 4: a resolved (fixed/cleared) issue must not read
                // as a current problem here. We keep the row (this is the
                // session's audit history — including the "Marked fixed"
                // event) but visually mark it resolved instead of deleting
                // it, so the history stays intact.
                const resolved = obs.issue.current_status === "resolved";
                return (
                  <li key={obs.id} className="flex items-center gap-2 text-sm">
                    <span
                      className={`size-1.5 rounded-full shrink-0 ${
                        resolved ? "bg-muted-foreground/40" : "bg-sky-500"
                      }`}
                    />
                    <span
                      className={`font-medium ${
                        resolved ? "text-muted-foreground line-through" : ""
                      }`}
                    >
                      {obs.issue.issue_type.name}
                    </span>
                    <span className="text-muted-foreground">— {actionCopy(obs.action)}</span>
                    {resolved && (
                      <span className="text-xs text-muted-foreground">· resolved</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {(loadingDetail || photoAssets.length > 0) && (
          <section>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
              Photos
            </div>
            {loadingDetail && photoAssets.length === 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: Math.max(1, session.photos.length) }).map(
                  (_, i) => (
                    <div
                      key={i}
                      className="aspect-square rounded-lg bg-muted animate-pulse"
                    />
                  ),
                )}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {photoAssets.map((asset) => (
                  <PhotoTile
                    key={asset.id}
                    asset={asset}
                    transcripts={allTranscripts}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {detailError && (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Couldn't load media for this session: {detailError}
          </div>
        )}
      </div>
    </>
  )
}

function actionCopy(action: string): string {
  switch (action) {
    case "logged":  return "Logged from photo"
    case "still":   return "Marked still present"
    case "fixed":   return "Marked fixed"
    case "skipped": return "Skipped"
    default:        return action
  }
}

// Pre-M3 sessions or status_color compute failure: fall back to the
// legacy notes-derived count so old rows still get a sensible chip.
function statusLabel(
  color: StatusColor | null,
  fallbackClean: boolean,
  fallbackIssueCount: number,
): string {
  if (color === "green") return "All clear"
  if (color === "yellow") return "Watch"
  if (color === "red") return "Action needed"
  if (fallbackClean) return "No issues"
  return `${fallbackIssueCount} ${fallbackIssueCount === 1 ? "finding" : "findings"}`
}

function PhotoTile({
  asset,
  transcripts,
}: {
  asset: MediaAssetWithSignedUrl
  transcripts: VoiceTranscription[]
}) {
  const [open, setOpen] = React.useState(false)
  const [expanded, setExpanded] = React.useState(false)

  const note = asset.note_text?.trim() ?? ""
  const hasText = note.length > 0
  const vt = asset.voice_transcription_id
    ? transcripts.find((t) => t.id === asset.voice_transcription_id)
    : undefined
  const voiceBody =
    vt?.transcription_status === "completed" && vt.transcript_text
      ? vt.transcript_text.trim()
      : asset.voice_transcription_id
        ? null
        : null

  const attachmentLabel = hasText ? "Note" : asset.voice_transcription_id ? "Voice note" : null
  const rawBody = hasText ? note : voiceBody
  const truncated =
    rawBody && rawBody.length > 200 ? rawBody.slice(0, 200) + "…" : rawBody
  const showExpand = Boolean(rawBody && rawBody.length > 200)

  if (!asset.signed_url) {
    return (
      <div className="aspect-square rounded-lg bg-muted ring-1 ring-border/60 flex flex-col items-center justify-center text-muted-foreground gap-1">
        <ImageOff className="size-5" />
        <span className="text-[10px]">Unavailable</span>
      </div>
    )
  }
  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative aspect-square w-full rounded-lg overflow-hidden ring-1 ring-border/60 bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        aria-label={`Open ${asset.file_name ?? "preflight photo"} full screen`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={asset.signed_url}
          alt={asset.file_name ?? "Preflight photo"}
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
        />
        {asset.quick_tag && (
          <span className="absolute bottom-1 left-1 inline-flex items-center rounded-full bg-white/90 backdrop-blur px-1.5 py-0.5 text-[10px] font-medium text-sky-700 capitalize ring-1 ring-sky-200">
            {asset.quick_tag}
          </span>
        )}
        {hasText && (
          <span className="absolute bottom-1 right-1 rounded-full bg-white/90 p-1 ring-1 ring-border/60" title="Text note">
            <FileText className="size-3 text-slate-700" aria-hidden />
          </span>
        )}
        {!hasText && asset.voice_transcription_id && (
          <span className="absolute bottom-1 right-1 rounded-full bg-white/90 p-1 ring-1 ring-border/60" title="Voice note">
            <Mic className="size-3 text-slate-700" aria-hidden />
          </span>
        )}
      </button>
      {attachmentLabel && (
        <div className="text-[11px] text-muted-foreground px-0.5">
          <span className="font-medium text-foreground/80">{attachmentLabel}: </span>
          {hasText ? (
            <span className="whitespace-pre-wrap text-foreground/90">
              {expanded ? note : truncated}
            </span>
          ) : voiceBody ? (
            <span className="whitespace-pre-wrap text-foreground/90">
              {expanded ? voiceBody : truncated}
            </span>
          ) : (
            <span className="italic">Voice note (transcription unavailable)</span>
          )}
          {showExpand && (
            <button
              type="button"
              className="block mt-0.5 text-sky-600 hover:underline"
              onClick={() => setExpanded((e) => !e)}
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      )}
      <PhotoLightbox
        open={open}
        onOpenChange={setOpen}
        src={asset.signed_url}
        alt={asset.file_name ?? "Preflight photo"}
      />
    </div>
  )
}

function AudioPlayer({ asset }: { asset: MediaAssetWithSignedUrl }) {
  if (!asset.signed_url) {
    return (
      <div className="text-xs text-muted-foreground italic">
        Audio unavailable
      </div>
    )
  }
  return (
    <audio
      controls
      preload="metadata"
      src={asset.signed_url}
      className="w-full"
    >
      Your browser does not support the audio element.
    </audio>
  )
}
