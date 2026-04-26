"use client";

import * as React from "react";
import { Loader2, Plane } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createAircraft } from "@/lib/api/aircraft";
import type { Aircraft } from "@/lib/types/database";

export function AddAircraftForm({
  onCreated,
  onCancel,
  autoFocus,
  ctaLabel = "Save aircraft",
}: {
  onCreated: (aircraft: Aircraft) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
  ctaLabel?: string;
}) {
  const [tail, setTail] = React.useState("");
  const [type, setType] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTail = tail.trim().toUpperCase().replace(/\s+/g, "");
    if (!cleanTail) return;
    setSubmitting(true);
    try {
      const created = await createAircraft({
        tail_number: cleanTail,
        aircraft_type: type.trim() || undefined,
      });
      onCreated(created);
    } catch (err) {
      toast.error("Couldn't add aircraft", {
        description: err instanceof Error ? err.message : String(err),
      });
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="tail-number">Tail number</Label>
        <Input
          id="tail-number"
          placeholder="N12345"
          value={tail}
          onChange={(e) => setTail(e.target.value)}
          required
          maxLength={20}
          autoFocus={autoFocus}
          disabled={submitting}
          autoComplete="off"
          spellCheck={false}
          className="uppercase tracking-wider"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="aircraft-type">
          Aircraft type{" "}
          <span className="text-xs text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="aircraft-type"
          placeholder="Piper Cherokee"
          value={type}
          onChange={(e) => setType(e.target.value)}
          maxLength={80}
          disabled={submitting}
          autoComplete="off"
        />
      </div>
      <div className="flex items-center gap-2 pt-2">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={submitting} className="flex-1">
          {submitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plane className="size-4 -rotate-45" />
          )}
          {ctaLabel}
        </Button>
      </div>
    </form>
  );
}
