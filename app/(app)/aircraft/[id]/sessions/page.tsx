"use client"

import * as React from "react"
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronRight,
  ImageOff,
  Plane,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { getSession, useSessions } from "@/lib/api/sessions"
import type { Session } from "@/lib/mock-helpers"
import type {
  MediaAssetWithSignedUrl,
  PreflightSessionDetail,
} from "@/lib/types/database"

export default function SessionsPage() {
  const { sessions } = useSessions()
  const [active, setActive] = React.useState<Session | null>(null)

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

      <Sheet open={!!active} onOpenChange={(o) => !o && setActive(null)}>
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
        <StatusPill color={session.statusColor} fallbackClean={clean} fallbackIssueCount={issueCount} />
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
  )
  const audioAssets = (detail?.media_assets ?? []).filter(
    (a) => a.media_type === "audio",
  )

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

        {detail && detail.issue_observations && detail.issue_observations.length > 0 && (
          <section>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
              Previous issue actions
            </div>
            <ul className="space-y-1.5">
              {detail.issue_observations.map((obs) => (
                <li key={obs.id} className="flex items-center gap-2 text-sm">
                  <span className="size-1.5 rounded-full bg-sky-500 shrink-0" />
                  <span className="font-medium">{obs.issue.issue_type.name}</span>
                  <span className="text-muted-foreground">— {actionCopy(obs.action)}</span>
                </li>
              ))}
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
                  <PhotoTile key={asset.id} asset={asset} />
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

function StatusPill({
  color,
  fallbackClean,
  fallbackIssueCount,
}: {
  color: "green" | "yellow" | "red" | null
  fallbackClean: boolean
  fallbackIssueCount: number
}) {
  if (color === "green") {
    return (
      <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
        All clear
      </Badge>
    )
  }
  if (color === "yellow") {
    return (
      <Badge variant="secondary" className="bg-amber-50 text-amber-700 hover:bg-amber-50">
        Watch
      </Badge>
    )
  }
  if (color === "red") {
    return (
      <Badge variant="secondary" className="bg-rose-50 text-rose-700 hover:bg-rose-50">
        Action needed
      </Badge>
    )
  }
  // Pre-M3 sessions or status_color compute failure: fall back to the
  // legacy notes-derived count so old rows still get a sensible chip.
  if (fallbackClean) {
    return (
      <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
        No issues
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" className="bg-amber-50 text-amber-700 hover:bg-amber-50">
      {fallbackIssueCount} {fallbackIssueCount === 1 ? "finding" : "findings"}
    </Badge>
  )
}

function PhotoTile({ asset }: { asset: MediaAssetWithSignedUrl }) {
  if (!asset.signed_url) {
    return (
      <div className="aspect-square rounded-lg bg-muted ring-1 ring-border/60 flex flex-col items-center justify-center text-muted-foreground gap-1">
        <ImageOff className="size-5" />
        <span className="text-[10px]">Unavailable</span>
      </div>
    )
  }
  return (
    <div className="relative aspect-square rounded-lg overflow-hidden ring-1 ring-border/60 bg-muted">
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
