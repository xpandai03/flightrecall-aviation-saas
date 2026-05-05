"use client";

import { Camera, CheckCircle2, Loader2, Mic } from "lucide-react";

import { cn } from "@/lib/utils";

export type InProgressInput = {
  /** Stable id — voice_transcription_id for voice, media_asset_id for photo, synthetic for no-issues. */
  key: string;
  kind: "voice" | "photo" | "no_issues";
  /** Pre-formatted summary line; falls back to a generic label when empty. */
  summary?: string | null;
  /** When true, render a small spinner next to the summary (used for voice transcripts in flight). */
  pending?: boolean;
};

const KIND_ICON = {
  voice: Mic,
  photo: Camera,
  no_issues: CheckCircle2,
} as const;

const KIND_LABEL: Record<InProgressInput["kind"], string> = {
  voice: "Voice note",
  photo: "Photo",
  no_issues: "Checklist photo",
};

export function InProgressList({ inputs }: { inputs: InProgressInput[] }) {
  if (inputs.length === 0) return null;
  return (
    <section
      aria-labelledby="in-progress-heading"
      className="w-full max-w-md"
    >
      <h2
        id="in-progress-heading"
        className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-3"
      >
        This preflight ({inputs.length})
      </h2>
      <ul className="flex flex-col gap-2">
        {inputs.map((input) => {
          const Icon = KIND_ICON[input.kind];
          return (
            <li
              key={input.key}
              className={cn(
                "flex items-center gap-3 rounded-2xl bg-bg-card-glass border border-border-subtle px-4 py-3 shadow-card-glow",
              )}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-mint/10 text-accent-mint">
                <Icon className="size-4" aria-hidden />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-text-primary truncate">
                  {input.summary && input.summary.length > 0
                    ? input.summary
                    : KIND_LABEL[input.kind]}
                </div>
                {input.pending && (
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-text-muted">
                    <Loader2 className="size-3 animate-spin" aria-hidden />
                    Transcribing…
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
