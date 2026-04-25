"use client"

import * as React from "react"

export type Observation = {
  text: string
  timestamp?: string
}

export type Session = {
  id: string
  aircraft: string
  date: string
  notes: Observation[]
  photos: string[]
  repeatedFlags: string[]
}

const SEED_SESSIONS: Session[] = [
  {
    id: "s-2026-04-16-n739x",
    aircraft: "N739X",
    date: "April 16, 2026",
    notes: [
      { text: "Oil residue under fuselage", timestamp: "07:12" },
      { text: "Brake softness left main gear", timestamp: "07:14" },
    ],
    photos: ["thumb-a", "thumb-b"],
    repeatedFlags: ["Brake softness"],
  },
  {
    id: "s-2026-04-14-n739x",
    aircraft: "N739X",
    date: "April 14, 2026",
    notes: [{ text: "No issues reported", timestamp: "06:55" }],
    photos: [],
    repeatedFlags: [],
  },
  {
    id: "s-2026-04-10-n739x",
    aircraft: "N739X",
    date: "April 10, 2026",
    notes: [
      { text: "Tire wear left main", timestamp: "08:02" },
      { text: "Brake softness noted on rollout", timestamp: "08:05" },
    ],
    photos: ["thumb-c"],
    repeatedFlags: [],
  },
]

type SessionsContextValue = {
  sessions: Session[]
  addSession: (session: Session) => void
}

const SessionsContext = React.createContext<SessionsContextValue | null>(null)

export function SessionsProvider({ children }: { children: React.ReactNode }) {
  const [sessions, setSessions] = React.useState<Session[]>(SEED_SESSIONS)

  const addSession = React.useCallback((session: Session) => {
    setSessions((prev) => [session, ...prev])
  }, [])

  const value = React.useMemo(() => ({ sessions, addSession }), [sessions, addSession])

  return React.createElement(SessionsContext.Provider, { value }, children)
}

export function useSessions() {
  const ctx = React.useContext(SessionsContext)
  if (!ctx) throw new Error("useSessions must be used inside SessionsProvider")
  return ctx
}

export function recentObservations(sessions: Session[], limit = 3): Observation[] {
  const all: Observation[] = []
  for (const s of sessions) {
    for (const n of s.notes) {
      if (n.text.toLowerCase().includes("no issues")) continue
      all.push(n)
    }
    if (all.length >= limit) break
  }
  return all.slice(0, limit)
}

export function repeatedObservations(sessions: Session[]): string[] {
  const counts = new Map<string, number>()
  for (const s of sessions) {
    for (const n of s.notes) {
      const key = normalize(n.text)
      if (!key) continue
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return Array.from(counts.entries())
    .filter(([, c]) => c >= 2)
    .map(([k]) => k)
}

function normalize(text: string): string {
  const lower = text.toLowerCase()
  if (lower.includes("brake softness")) return "Brake softness"
  if (lower.includes("oil residue")) return "Oil residue"
  if (lower.includes("tire wear")) return "Tire wear"
  return ""
}
