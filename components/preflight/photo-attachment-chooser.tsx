"use client";

import { FileText, Mic } from "lucide-react";

import { Button } from "@/components/ui/button";

export function PhotoAttachmentChooser({
  onVoice,
  onText,
  onDone,
  disabled,
}: {
  onVoice: () => void;
  onText: () => void;
  onDone: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-3 w-full max-w-md">
      <p className="text-xs text-muted-foreground text-center">
        Optional context for this photo — voice, text, or skip.
      </p>
      <div className="flex flex-col sm:flex-row gap-2 w-full justify-center">
        <Button
          type="button"
          variant="secondary"
          className="rounded-full gap-2"
          onClick={onVoice}
          disabled={disabled}
        >
          <Mic className="size-4" />
          Voice note
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="rounded-full gap-2"
          onClick={onText}
          disabled={disabled}
        >
          <FileText className="size-4" />
          Text note
        </Button>
        <Button
          type="button"
          className="rounded-full"
          onClick={onDone}
          disabled={disabled}
        >
          Done
        </Button>
      </div>
    </div>
  );
}
