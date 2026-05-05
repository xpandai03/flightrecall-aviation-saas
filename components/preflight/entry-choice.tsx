"use client";

import { Camera, CheckCircle2, Mic } from "lucide-react";

import { cn } from "@/lib/utils";

type Choice = "voice" | "photo" | "no_issues";
type Accent = "mint" | "teal" | "clear";

export function EntryChoice({
  onPick,
  onCancel,
}: {
  onPick: (choice: Choice) => void;
  onCancel?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-sm">
      <div className="text-center">
        <h2 className="text-xl font-semibold tracking-tight text-text-primary">
          How do you want to log it?
        </h2>
        <p className="text-sm text-text-secondary mt-1">
          Pick one. You can do another preflight after.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 w-full">
        <ChoiceButton
          icon={<Mic className="size-5" />}
          label="Voice Note"
          hint="Record up to 60 seconds — we'll transcribe."
          onClick={() => onPick("voice")}
          accent="mint"
        />
        <ChoiceButton
          icon={<Camera className="size-5" />}
          label="Take Photo"
          hint="Camera on phone, file picker on desktop."
          onClick={() => onPick("photo")}
          accent="teal"
        />
        <ChoiceButton
          icon={<CheckCircle2 className="size-5" />}
          label="No Issues"
          hint="Quick clean-preflight log."
          onClick={() => onPick("no_issues")}
          accent="clear"
        />
      </div>

      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          Cancel
        </button>
      )}
    </div>
  );
}

const ACCENT_BAR: Record<Accent, string> = {
  mint: "bg-accent-mint",
  teal: "bg-accent-teal",
  clear: "bg-status-clear",
};

const ACCENT_TILE: Record<Accent, string> = {
  mint: "bg-accent-mint/15 text-accent-mint",
  teal: "bg-accent-teal/15 text-accent-teal",
  clear: "bg-status-clear/15 text-status-clear",
};

const ACCENT_HOVER: Record<Accent, string> = {
  mint: "hover:border-accent-mint/40",
  teal: "hover:border-accent-teal/40",
  clear: "hover:border-status-clear/40",
};

const ACCENT_RING: Record<Accent, string> = {
  mint: "focus-visible:ring-accent-mint",
  teal: "focus-visible:ring-accent-teal",
  clear: "focus-visible:ring-status-clear",
};

function ChoiceButton({
  icon,
  label,
  hint,
  onClick,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
  accent: Accent;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex items-center gap-4 overflow-hidden rounded-2xl bg-bg-card border border-border-subtle px-4 py-4 pl-5 text-left shadow-card-glow transition-colors min-h-[68px]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base",
        ACCENT_HOVER[accent],
        ACCENT_RING[accent],
      )}
    >
      <span
        className={cn("absolute inset-y-0 left-0 w-1", ACCENT_BAR[accent])}
        aria-hidden
      />
      <span
        className={cn(
          "flex size-10 items-center justify-center rounded-lg shrink-0 transition-colors",
          ACCENT_TILE[accent],
        )}
      >
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-base font-semibold tracking-tight text-text-primary">
          {label}
        </span>
        <span className="block text-xs text-text-secondary mt-0.5">{hint}</span>
      </span>
    </button>
  );
}
