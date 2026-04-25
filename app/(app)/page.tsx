"use client"

import * as React from "react"
import { toast } from "sonner"
import { ImagePlus, Mic, Plane, RotateCcw, Square } from "lucide-react"

import { Orb, type OrbState } from "@/components/orb"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useAudioLevel } from "@/hooks/use-audio-level"
import { useSessions, type Observation } from "@/lib/mock-data"

type FlowState = "idle" | "listening" | "completed"

const TRANSCRIPT_LINES = [
  "Oil residue under fuselage.",
  "Brake softness on left main gear.",
]

const CHAR_DELAY = 55
const LINE_START_DELAYS = [250, 1950]

function todayLabel() {
  return new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  })
}

export default function DashboardPage() {
  const { audioLevel, isListening, startListening, stopListening } = useAudioLevel()
  const { sessions, addSession } = useSessions()

  const [flow, setFlow] = React.useState<FlowState>("idle")
  const [typed, setTyped] = React.useState<string[]>(["", ""])
  const [photoPromptOpen, setPhotoPromptOpen] = React.useState(false)
  const [pendingPhotos, setPendingPhotos] = React.useState<string[]>([])
  const [simulatedLevel, setSimulatedLevel] = React.useState(0)
  const timersRef = React.useRef<ReturnType<typeof setTimeout>[]>([])
  const simIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null)

  const clearTimers = React.useCallback(() => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
    if (simIntervalRef.current) {
      clearInterval(simIntervalRef.current)
      simIntervalRef.current = null
    }
  }, [])

  React.useEffect(() => () => clearTimers(), [clearTimers])

  const commitSession = React.useCallback(
    (photos: string[]) => {
      const notes: Observation[] = TRANSCRIPT_LINES.map((text, i) => ({
        text: text.replace(/\.$/, ""),
        timestamp: new Date(Date.now() + i * 1000).toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }),
      }))
      const brakeSeenBefore = sessions.some((s) =>
        s.notes.some((n) => n.text.toLowerCase().includes("brake softness")),
      )
      addSession({
        id: `s-${Date.now()}`,
        aircraft: "N739X",
        date: todayLabel(),
        notes,
        photos,
        repeatedFlags: brakeSeenBefore ? ["Brake softness"] : [],
      })
    },
    [addSession, sessions],
  )

  const runTranscript = React.useCallback(() => {
    setTyped(["", ""])
    TRANSCRIPT_LINES.forEach((line, lineIdx) => {
      for (let i = 1; i <= line.length; i++) {
        const t = setTimeout(() => {
          setTyped((prev) => {
            const next = [...prev]
            next[lineIdx] = line.slice(0, i)
            return next
          })
        }, LINE_START_DELAYS[lineIdx] + i * CHAR_DELAY)
        timersRef.current.push(t)
      }
    })

    const completeAt =
      LINE_START_DELAYS[1] + TRANSCRIPT_LINES[1].length * CHAR_DELAY + 450
    const completeTimer = setTimeout(() => {
      stopListening()
      if (simIntervalRef.current) {
        clearInterval(simIntervalRef.current)
        simIntervalRef.current = null
      }
      setSimulatedLevel(0)
      setFlow("completed")
      toast.success("Saved", {
        description: "Preflight note captured to this session.",
      })
      setPhotoPromptOpen(true)
    }, completeAt)
    timersRef.current.push(completeTimer)
  }, [stopListening])

  const handleStart = React.useCallback(async () => {
    clearTimers()
    setFlow("listening")
    setTyped(["", ""])
    await startListening()
    // Synthetic pulse as safety net if the mic is silent / denied
    let t = 0
    simIntervalRef.current = setInterval(() => {
      t += 0.08
      const wave = (Math.sin(t * 2.4) + 1) / 2
      const jitter = Math.random() * 0.2
      setSimulatedLevel(Math.min(1, wave * 0.7 + jitter * 0.4))
    }, 60)
    runTranscript()
  }, [clearTimers, runTranscript, startListening])

  const handleReset = React.useCallback(() => {
    clearTimers()
    stopListening()
    setSimulatedLevel(0)
    setTyped(["", ""])
    setPendingPhotos([])
    setPhotoPromptOpen(false)
    setFlow("idle")
  }, [clearTimers, stopListening])

  const handleUploadPhotos = () => {
    const photos = ["thumb-new-a", "thumb-new-b"]
    setPendingPhotos(photos)
    setPhotoPromptOpen(false)
    commitSession(photos)
    toast("Photos attached", { description: "2 inspection photos added." })
  }

  const handleNoPhotos = () => {
    setPhotoPromptOpen(false)
    commitSession([])
  }

  const orbState: OrbState = flow === "listening" ? "listening" : flow === "completed" ? "saved" : "idle"
  const effectiveLevel = isListening ? Math.max(audioLevel, simulatedLevel * 0.7) : simulatedLevel * 0.5

  return (
    <div className="flex flex-col items-center gap-10 py-4 sm:py-10">
      <div className="flex flex-col items-center text-center gap-2">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-sky-200/70 bg-sky-50/70 px-3 py-1 text-xs font-medium text-sky-700">
          <Plane className="size-3 -rotate-45" />
          Preflight · {todayLabel()} · N739X
        </div>
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">Flight Memory</h1>
        <p className="text-muted-foreground text-sm sm:text-base">
          Voice-first preflight logging. Speak what you see, we remember.
        </p>
      </div>

      <Orb state={orbState} audioLevel={effectiveLevel} />

      <TranscriptPanel flow={flow} lines={typed} />

      <div className="flex flex-col items-center gap-3">
        {flow === "idle" && (
          <Button size="lg" onClick={handleStart} className="h-12 px-7 rounded-full shadow-sm">
            <Mic className="size-4" />
            Start Preflight
          </Button>
        )}

        {flow === "listening" && (
          <Button
            size="lg"
            variant="secondary"
            onClick={handleReset}
            className="h-12 px-7 rounded-full"
          >
            <Square className="size-3.5 fill-current" />
            Stop
          </Button>
        )}

        {flow === "completed" && (
          <div className="flex flex-col items-center gap-3">
            {pendingPhotos.length > 0 && (
              <div className="flex gap-2">
                {pendingPhotos.map((p) => (
                  <PhotoThumb key={p} />
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleReset} className="rounded-full">
                End Session
              </Button>
              <Button onClick={handleReset} className="rounded-full">
                <RotateCcw className="size-3.5" />
                Start New Note
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={photoPromptOpen} onOpenChange={setPhotoPromptOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add photos from inspection?</DialogTitle>
            <DialogDescription>
              Attach photos to this note so findings stay visual in your session log.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <button
              type="button"
              onClick={handleUploadPhotos}
              className="group flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-sky-300 bg-sky-50/50 p-6 text-sm text-sky-800 transition-colors hover:border-sky-400 hover:bg-sky-50"
            >
              <ImagePlus className="size-5" />
              Upload Photos
            </button>
            <button
              type="button"
              onClick={handleNoPhotos}
              className="rounded-lg border border-border bg-background p-6 text-sm text-muted-foreground transition-colors hover:bg-accent"
            >
              No Photos
            </button>
          </div>
          <DialogFooter className="text-xs text-muted-foreground">
            Note will be saved either way.
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TranscriptPanel({ flow, lines }: { flow: FlowState; lines: string[] }) {
  const show = flow !== "idle"
  return (
    <div
      className={`w-full max-w-md transition-all duration-500 ${
        show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none h-0"
      }`}
    >
      <div className="rounded-2xl border border-border/80 bg-background/80 backdrop-blur-sm px-5 py-4 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
          <span
            className={`inline-flex size-1.5 rounded-full ${
              flow === "listening" ? "bg-sky-500 animate-pulse" : "bg-emerald-500"
            }`}
          />
          {flow === "listening" ? "Listening…" : "Transcript"}
        </div>
        <div className="space-y-1.5 text-[15px] leading-relaxed text-foreground min-h-[3.5rem]">
          {lines.map((l, i) => (
            <p key={i}>
              {l}
              {flow === "listening" && l.length > 0 && i === lines.findIndex((x) => x.length > 0 && x !== lines[1]) && (
                <span className="ml-0.5 inline-block w-[2px] h-4 align-middle bg-foreground/60 animate-pulse" />
              )}
            </p>
          ))}
        </div>
      </div>
    </div>
  )
}

function PhotoThumb() {
  return (
    <div className="size-16 rounded-lg bg-gradient-to-br from-slate-200 via-sky-100 to-slate-300 shadow-sm ring-1 ring-border/60 flex items-center justify-center">
      <Plane className="size-5 text-slate-500/70 -rotate-45" />
    </div>
  )
}
