"use client";

import * as React from "react";
import { ClipboardCheck, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PhotoLightbox } from "@/components/photo-lightbox";
import {
  deleteChecklistImage,
  fetchAircraftChecklist,
  uploadChecklistImage,
} from "@/lib/api/checklist";
import { CHECKLIST_CAP, canAddChecklist } from "@/lib/checklist";
import type { ChecklistImage } from "@/lib/types/database";

/**
 * Dashboard pre-flight checklist card (below the greeting). When no
 * checklist is on file it shows a yellow "Add pre-flight checklist"
 * affordance; once present it shows the image(s) with view + add/replace +
 * remove. Aircraft-level — independent of the preflight issue flow.
 */
export function DashboardChecklistCard({ aircraftId }: { aircraftId: string }) {
  const [images, setImages] = React.useState<ChecklistImage[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [lightbox, setLightbox] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const load = React.useCallback(async () => {
    try {
      const { images } = await fetchAircraftChecklist(aircraftId);
      setImages(images);
    } catch {
      // Non-fatal: leave the card in its empty state; the user can retry.
    } finally {
      setLoading(false);
    }
  }, [aircraftId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setBusy(true);
    try {
      await uploadChecklistImage(
        aircraftId,
        file,
        file.name || "checklist.jpg",
        file.type || "image/jpeg",
      );
      await load();
      toast.success("Checklist saved");
    } catch {
      toast.error("Couldn't save checklist image. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (mediaId: string) => {
    if (busy) return;
    setBusy(true);
    const prev = images;
    setImages((cur) => cur.filter((i) => i.id !== mediaId)); // optimistic
    try {
      await deleteChecklistImage(aircraftId, mediaId);
    } catch {
      setImages(prev); // rollback
      toast.error("Couldn't remove image. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const triggerPicker = () => inputRef.current?.click();
  const atCap = !canAddChecklist(images.length);

  // Hidden capture input — iOS Safari opens the camera; desktop = file picker.
  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      capture="environment"
      className="sr-only"
      onChange={handleFile}
    />
  );

  if (loading) {
    return (
      <div className="w-full rounded-2xl border border-border/80 bg-card px-5 py-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading checklist…
        </div>
      </div>
    );
  }

  // Empty state — yellow "add" affordance.
  if (images.length === 0) {
    return (
      <button
        type="button"
        onClick={triggerPicker}
        disabled={busy}
        className="w-full rounded-2xl border border-dashed border-amber-400/70 bg-amber-50/5 px-5 py-4 text-left transition-colors hover:bg-amber-50/10 disabled:opacity-60"
      >
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-full bg-amber-400/15 text-amber-500">
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
          </span>
          <div>
            <div className="text-sm font-medium text-amber-500">
              Add pre-flight checklist
            </div>
            <div className="text-xs text-muted-foreground">
              Photograph your checklist sheet (front &amp; back) to keep it on file.
            </div>
          </div>
        </div>
        {fileInput}
      </button>
    );
  }

  // Present — image(s) + view/add/replace/remove.
  return (
    <div className="w-full rounded-2xl border border-border/80 bg-card px-5 py-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
          <ClipboardCheck className="size-4 text-emerald-500" />
          Pre-flight Checklist
        </div>
        <span className="inline-flex items-center rounded-full border border-emerald-200/30 bg-emerald-50/10 px-2 py-0.5 text-[11px] font-medium text-emerald-500">
          On file
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {images.map((img) => (
          <div key={img.id} className="relative">
            <button
              type="button"
              onClick={() => img.signed_url && setLightbox(img.signed_url)}
              className="size-20 overflow-hidden rounded-lg bg-muted ring-1 ring-border/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              aria-label="View checklist image"
            >
              {img.signed_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={img.signed_url}
                  alt="Pre-flight checklist"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                  Unavailable
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => handleRemove(img.id)}
              disabled={busy}
              aria-label="Remove checklist image"
              className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-background ring-1 ring-border text-muted-foreground hover:text-rose-500 disabled:opacity-50"
            >
              <Trash2 className="size-3" />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={triggerPicker}
          disabled={busy}
          className="flex size-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-muted-foreground transition-colors hover:bg-accent disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          <span className="text-[11px]">{atCap ? "Replace" : "Add page"}</span>
        </button>
        {fileInput}
      </div>

      {atCap && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {CHECKLIST_CAP} pages on file — adding another replaces the oldest.
        </p>
      )}

      <PhotoLightbox
        open={lightbox !== null}
        onOpenChange={(open) => !open && setLightbox(null)}
        src={lightbox}
        alt="Pre-flight checklist"
      />
    </div>
  );
}
