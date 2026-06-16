"use client";

import * as React from "react";
import { Loader2, Plane } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { joinAircraftByTail } from "@/lib/api/aircraft";
import { isJoinByTailWellFormed } from "@/lib/open-join";
import type { Aircraft } from "@/lib/types/database";

/**
 * Open join (no invite code): join an existing aircraft by entering its tail
 * number + aircraft type. The owner accepted that tail numbers are public;
 * the type is a small barrier against wrong-plane joins, not a secret. On
 * success the aircraft (now visible via membership RLS) is returned. This is
 * a SEPARATE path from JoinAircraftForm (invite code) — both stay available.
 */
export function JoinByTailForm({
  onJoined,
  onCancel,
  autoFocus,
}: {
  onJoined: (aircraft: Aircraft) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const [tail, setTail] = React.useState("");
  const [type, setType] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isJoinByTailWellFormed(tail, type)) return;
    setSubmitting(true);
    try {
      const joined = await joinAircraftByTail(tail, type);
      onJoined(joined);
    } catch {
      toast.error("No matching aircraft found", {
        description:
          "Check the tail number and aircraft type with the owner and try again.",
      });
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="join-tail-number">Tail number</Label>
        <Input
          id="join-tail-number"
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
        <Label htmlFor="join-aircraft-type">Aircraft type</Label>
        <Input
          id="join-aircraft-type"
          placeholder="Cessna 172"
          value={type}
          onChange={(e) => setType(e.target.value)}
          required
          maxLength={80}
          disabled={submitting}
          autoComplete="off"
        />
        <p className="text-xs text-muted-foreground">
          Both the tail number and aircraft type must match an existing
          aircraft. You&rsquo;ll join as a pilot and see only that
          aircraft&rsquo;s logs.
        </p>
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
          Join aircraft
        </Button>
      </div>
    </form>
  );
}
