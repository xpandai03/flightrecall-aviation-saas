"use client";

import { Camera, CheckCircle2, Mic } from "lucide-react";

type Choice = "voice" | "photo" | "no_issues";

export function EntryChoice({
  onPick,
  onCancel,
}: {
  onPick: (choice: Choice) => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-md">
      <div className="text-center">
        <h2 className="text-xl font-semibold tracking-tight">How do you want to log it?</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Pick one. You can do another preflight after.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 w-full">
        <ChoiceButton
          icon={<Mic className="size-5" />}
          label="Voice Note"
          hint="Record up to 60 seconds — we'll transcribe."
          onClick={() => onPick("voice")}
          accent="sky"
        />
        <ChoiceButton
          icon={<Camera className="size-5" />}
          label="Take Photo"
          hint="Camera on phone, file picker on desktop."
          onClick={() => onPick("photo")}
          accent="sky"
        />
        <ChoiceButton
          icon={<CheckCircle2 className="size-5" />}
          label="No Issues"
          hint="Quick clean-preflight log."
          onClick={() => onPick("no_issues")}
          accent="emerald"
        />
      </div>

      <button
        type="button"
        onClick={onCancel}
        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}

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
  accent: "sky" | "emerald";
}) {
  const accentClass =
    accent === "sky"
      ? "border-sky-200 bg-sky-50/50 hover:bg-sky-50 text-sky-700"
      : "border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50 text-emerald-700";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-4 rounded-xl border ${accentClass} px-4 py-4 text-left transition-colors min-h-[64px]`}
    >
      <span className="flex size-10 items-center justify-center rounded-lg bg-white shadow-sm shrink-0">
        {icon}
      </span>
      <span className="flex-1">
        <span className="block text-base font-semibold tracking-tight">{label}</span>
        <span className="block text-xs text-muted-foreground mt-0.5">{hint}</span>
      </span>
    </button>
  );
}
