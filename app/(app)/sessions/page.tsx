"use client"

import * as React from "react"
import { AlertTriangle, Camera, CheckCircle2, ChevronRight, Plane } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { useSessions, type Session } from "@/lib/mock-data"

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
        {clean ? (
          <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
            No issues
          </Badge>
        ) : (
          <Badge variant="secondary" className="bg-amber-50 text-amber-700 hover:bg-amber-50">
            {issueCount} {issueCount === 1 ? "finding" : "findings"}
          </Badge>
        )}
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

        {session.photos.length > 0 && (
          <section>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
              Photos
            </div>
            <div className="grid grid-cols-3 gap-2">
              {session.photos.map((p, i) => (
                <div
                  key={p + i}
                  className="aspect-square rounded-lg bg-gradient-to-br from-slate-200 via-sky-100 to-slate-300 ring-1 ring-border/60 flex items-center justify-center"
                >
                  <Plane className="size-6 text-slate-500/60 -rotate-45" />
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  )
}
