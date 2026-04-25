"use client"

import { AlertTriangle, Clock, Sparkles } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  recentObservations,
  repeatedObservations,
  useSessions,
} from "@/lib/mock-data"

export default function MemoryPage() {
  const { sessions } = useSessions()
  const recents = recentObservations(sessions, 3)
  const repeats = repeatedObservations(sessions)

  return (
    <div className="flex flex-col gap-8 max-w-2xl">
      <div>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-sky-200/70 bg-sky-50/70 px-3 py-1 text-xs font-medium text-sky-700">
          <Sparkles className="size-3" />
          Recall intelligence
        </div>
        <h1 className="text-2xl font-semibold tracking-tight mt-3">Memory</h1>
        <p className="text-sm text-muted-foreground mt-1">
          What Flight Memory remembers across your preflights.
        </p>
      </div>

      <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground mb-4">
          <Clock className="size-3.5" />
          Last 3 observations
        </div>
        {recents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recent observations yet.</p>
        ) : (
          <ul className="space-y-3">
            {recents.map((o, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="mt-2 size-1.5 rounded-full bg-sky-500 shrink-0" />
                <span className="text-[15px] text-foreground">{o.text}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {repeats.length > 0 && (
        <section className="rounded-2xl border border-amber-200/70 bg-amber-50/50 p-6">
          <div className="flex items-start gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-amber-100 text-amber-700 shrink-0">
              <AlertTriangle className="size-4" />
            </span>
            <div className="flex-1">
              <div className="text-sm font-semibold text-amber-900">Repeated finding</div>
              <p className="text-sm text-amber-800/80 mt-0.5">
                {repeats[0]} has been noted across multiple sessions. Worth a closer look.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {repeats.map((r) => (
                  <Badge
                    key={r}
                    variant="secondary"
                    className="bg-white text-amber-800 border border-amber-200 hover:bg-white"
                  >
                    ⚠ {r} noted multiple times
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
