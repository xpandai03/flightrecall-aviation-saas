"use client";

import * as React from "react";
import { Loader2, KeyRound } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { joinAircraftByCode } from "@/lib/api/aircraft";
import type { Aircraft } from "@/lib/types/database";

/**
 * Join a shared aircraft with an invite code (Phase 2). The code is the
 * ONLY join path — a tail number alone never joins. On success the
 * aircraft (now visible via membership RLS) is returned to the caller.
 */
export function JoinAircraftForm({
  onJoined,
  onCancel,
  autoFocus,
}: {
  onJoined: (aircraft: Aircraft) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const [code, setCode] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = code.trim();
    if (!clean) return;
    setSubmitting(true);
    try {
      const joined = await joinAircraftByCode(clean);
      onJoined(joined);
    } catch {
      // Uniform, non-enumerable message — never reveals whether a code exists.
      toast.error("Invalid or expired code", {
        description: "Check the code with the aircraft owner and try again.",
      });
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="invite-code">Invite code</Label>
        <Input
          id="invite-code"
          placeholder="Paste the code the owner shared"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
          maxLength={128}
          autoFocus={autoFocus}
          disabled={submitting}
          autoComplete="off"
          spellCheck={false}
          className="tracking-wide"
        />
        <p className="text-xs text-muted-foreground">
          Ask the aircraft owner to share a code from their dashboard. A tail
          number alone can&rsquo;t join.
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
            <KeyRound className="size-4" />
          )}
          Join aircraft
        </Button>
      </div>
    </form>
  );
}
