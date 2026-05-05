"use client";

import * as React from "react";
import { ImageOff, Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

export type PhotoLightboxProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Signed URL for the full-resolution photo. Null while a parent
   *  is still resolving the URL, or when the URL has failed. */
  src: string | null;
  alt?: string;
};

/**
 * Full-screen photo preview built on shadcn Dialog. Tap-outside, ESC,
 * and the built-in close button all dismiss. No zoom/pan/next-arrow
 * affordances — that's deliberate V1 scope.
 */
export function PhotoLightbox({
  open,
  onOpenChange,
  src,
  alt,
}: PhotoLightboxProps) {
  const [imgLoaded, setImgLoaded] = React.useState(false);

  React.useEffect(() => {
    if (!open) setImgLoaded(false);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[95vw] max-h-[95vh] w-auto p-0 bg-black/95 border-none shadow-none sm:max-w-[95vw] gap-0"
      >
        <DialogTitle className="sr-only">Photo preview</DialogTitle>
        <div className="relative flex items-center justify-center min-h-[40vh] min-w-[40vw]">
          {src ? (
            <>
              {!imgLoaded && (
                <Loader2 className="size-6 animate-spin text-white/80" />
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={alt ?? "Preflight photo"}
                onLoad={() => setImgLoaded(true)}
                className={
                  imgLoaded
                    ? "max-w-[95vw] max-h-[95vh] object-contain"
                    : "hidden"
                }
              />
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 text-white/70 px-8 py-12">
              <ImageOff className="size-6" />
              <span className="text-sm">Image unavailable</span>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
