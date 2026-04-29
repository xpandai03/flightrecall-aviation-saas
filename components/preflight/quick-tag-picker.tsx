"use client";

import { Button } from "@/components/ui/button";
import type { QuickTag } from "@/lib/types/database";

const TAGS: { value: QuickTag; label: string }[] = [
  { value: "scratch", label: "Scratch" },
  { value: "dent", label: "Dent" },
  { value: "tire", label: "Tire" },
  { value: "oil", label: "Oil" },
  { value: "other", label: "Other" },
];

export function QuickTagPicker({
  value,
  onChange,
  onSave,
  onCancel,
  saving,
  mode = "photo",
}: {
  value: QuickTag | null;
  onChange: (next: QuickTag | null) => void;
  onSave: () => void;
  onCancel: () => void;
  saving?: boolean;
  mode?: "photo" | "voice";
}) {
  const heading = mode === "voice" ? "Tag this voice note" : "Tag this photo";
  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-md">
      <div className="text-center">
        <h3 className="text-base font-semibold tracking-tight">{heading}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Optional. Tap once to select.</p>
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {TAGS.map((tag) => {
          const selected = value === tag.value;
          return (
            <button
              key={tag.value}
              type="button"
              onClick={() => onChange(selected ? null : tag.value)}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors min-h-[44px] ${
                selected
                  ? "border-sky-300 bg-sky-50 text-sky-700"
                  : "border-border bg-background text-foreground hover:bg-accent"
              }`}
            >
              {tag.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2 mt-2">
        <Button
          variant="outline"
          onClick={onCancel}
          className="rounded-full"
          disabled={saving}
        >
          Cancel
        </Button>
        <Button onClick={onSave} className="rounded-full" disabled={saving}>
          {saving ? "Saving…" : value ? "Save with tag" : "Save without tag"}
        </Button>
      </div>
    </div>
  );
}
