"use client";

import * as React from "react";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { updateTranscript } from "@/lib/api/sessions";

export type EditableTranscriptProps = {
  /** voice_transcriptions.id — destination of the PATCH. */
  transcriptionId: string;
  /** Current server-side transcript text. Read on mount only — later
   *  prop changes are ignored to prevent the parent's stale poll value
   *  from clobbering the user's saved edit. */
  initialText: string;
  /** Notify parent on successful save (e.g. to keep a view-model in
   *  sync). Optional. */
  onSaved?: (next: string) => void;
};

type Mode = "view" | "editing" | "saving";

/**
 * Inline edit affordance for a voice transcript. Pencil icon next to a
 * "Transcript" label; click to enter edit mode; textarea + Save/Cancel.
 *
 * Optimistic UI: Save flips to view mode immediately, then fires the
 * PATCH in the background. On failure: revert displayText, drop back
 * into edit mode with the user's draft preserved, toast the error.
 *
 * Empty string saves are permitted and render as italic "(empty)" in
 * view mode. Editing does NOT re-run keyword extraction — existing
 * extracted issues remain unchanged (V1 limitation).
 */
export function EditableTranscript({
  transcriptionId,
  initialText,
  onSaved,
}: EditableTranscriptProps) {
  // Lazy init: read initialText once on mount. Subsequent prop changes
  // (e.g. parent's poll value updates) are intentionally ignored —
  // otherwise a polling re-render after save would revert the edit.
  const [displayText, setDisplayText] = React.useState(() => initialText);
  const [mode, setMode] = React.useState<Mode>("view");
  const [draft, setDraft] = React.useState("");
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (mode === "editing" && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(
        textareaRef.current.value.length,
        textareaRef.current.value.length,
      );
    }
  }, [mode]);

  const enterEdit = () => {
    setDraft(displayText);
    setMode("editing");
  };

  const cancel = () => {
    setDraft("");
    setMode("view");
  };

  const save = async () => {
    if (mode === "saving") return;
    const previous = displayText;
    const next = draft;
    // Optimistic: flip to view mode first.
    setDisplayText(next);
    setMode("saving");
    try {
      await updateTranscript(transcriptionId, next);
      setMode("view");
      setDraft("");
      onSaved?.(next);
      toast.success("Transcript saved.");
    } catch (err) {
      // Rollback. Keep draft so user doesn't lose their text.
      setDisplayText(previous);
      setMode("editing");
      toast.error("Couldn't save changes. Try again.", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  };

  if (mode === "editing" || mode === "saving") {
    const saving = mode === "saving";
    return (
      <div className="space-y-2">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Transcript
        </div>
        <Textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={saving}
          rows={4}
          maxLength={2000}
          className="text-[15px] leading-relaxed"
          aria-label="Edit transcript"
        />
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={cancel}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={save}
            disabled={saving}
          >
            {saving && <Loader2 className="size-3.5 animate-spin" />}
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Transcript
        </div>
        <button
          type="button"
          onClick={enterEdit}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Edit transcript"
        >
          <Pencil className="size-3" />
          Edit
        </button>
      </div>
      {displayText.length > 0 ? (
        <p className="text-[15px] leading-relaxed text-foreground whitespace-pre-line">
          {displayText}
        </p>
      ) : (
        <p className="text-[15px] italic text-muted-foreground">(empty)</p>
      )}
    </div>
  );
}
