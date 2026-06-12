"use client";

import * as React from "react";
import { Check, Copy, Loader2, RefreshCw, Share2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  generateAircraftInvite,
  getAircraftInvite,
  revokeAircraftInvite,
} from "@/lib/api/aircraft";

/**
 * Owner-only "Share this aircraft" control. Surfaces the current invite
 * code (generating one on demand), with copy / regenerate / revoke. Only
 * the owner sees this (gated by the caller). A co-pilot redeems the code in
 * Add Aircraft → "Join with code".
 */
export function ShareAircraftButton({
  aircraftId,
  tailNumber,
}: {
  aircraftId: string;
  tailNumber: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [code, setCode] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const { code } = await getAircraftInvite(aircraftId);
      setCode(code);
    } catch {
      toast.error("Couldn't load the invite code.");
    } finally {
      setLoading(false);
    }
  }, [aircraftId]);

  React.useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const generate = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { code } = await generateAircraftInvite(aircraftId);
      setCode(code);
      toast.success(code ? "Invite code ready" : "Invite code regenerated");
    } catch {
      toast.error("Couldn't generate a code.");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await revokeAircraftInvite(aircraftId);
      setCode(null);
      toast.success("Invite code revoked");
    } catch {
      toast.error("Couldn't revoke the code.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy. Select and copy the code manually.");
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="rounded-full gap-1.5"
      >
        <Share2 className="size-3.5" />
        Share
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share {tailNumber}</DialogTitle>
            <DialogDescription>
              Send this code to another pilot so they can join {tailNumber} and
              see its logs. Anyone with the code can join — regenerate or revoke
              it anytime.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="size-4 animate-spin" />
              Loading…
            </div>
          ) : code ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <code className="flex-1 select-all rounded-lg border border-border bg-muted px-3 py-2 font-mono text-sm break-all">
                  {code}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={copy}
                  aria-label="Copy code"
                >
                  {copied ? (
                    <Check className="size-4 text-emerald-500" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={generate}
                  disabled={busy}
                  className="gap-1.5"
                >
                  <RefreshCw className="size-3.5" />
                  Regenerate
                </Button>
                <Button
                  variant="ghost"
                  onClick={revoke}
                  disabled={busy}
                  className="gap-1.5 text-rose-500 hover:text-rose-600"
                >
                  <Trash2 className="size-3.5" />
                  Revoke
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Regenerating invalidates the previous code.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                No active invite code. Generate one to share this aircraft.
              </p>
              <Button onClick={generate} disabled={busy} className="gap-1.5">
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Share2 className="size-4" />
                )}
                Generate invite code
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
