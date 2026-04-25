"use client";

import * as React from "react";
import { Camera, ImagePlus, RefreshCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PhotoCapture({
  onCaptured,
  onCancel,
}: {
  onCaptured: (file: File, previewUrl: string) => void;
  onCancel: () => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    onCaptured(file, previewUrl);
  };

  const triggerPicker = () => inputRef.current?.click();

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-md">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-sky-50 text-sky-600">
          <Camera className="size-5" />
        </span>
        <h2 className="text-xl font-semibold tracking-tight">Take a photo</h2>
        <p className="text-sm text-muted-foreground max-w-xs">
          Camera opens on phone. On desktop, this is a file picker.
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={handleChange}
      />

      <div className="flex flex-col items-center gap-3 w-full">
        <Button
          size="lg"
          onClick={triggerPicker}
          className="h-12 px-7 rounded-full w-full"
        >
          <ImagePlus className="size-4" />
          Open Camera
        </Button>
        <Button variant="outline" onClick={onCancel} className="rounded-full">
          <X className="size-3.5" />
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function PhotoPreview({
  previewUrl,
  onRetake,
}: {
  previewUrl: string;
  onRetake: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-md">
      <div className="relative w-full aspect-square overflow-hidden rounded-xl border border-border bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewUrl}
          alt="Captured preflight photo"
          className="absolute inset-0 w-full h-full object-cover"
        />
      </div>
      <button
        type="button"
        onClick={onRetake}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <RefreshCcw className="size-3.5" />
        Retake photo
      </button>
    </div>
  );
}
