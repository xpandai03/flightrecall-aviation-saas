"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AddOrJoinAircraft } from "@/components/aircraft/add-or-join-aircraft";
import type { Aircraft } from "@/lib/types/database";

export function AddAircraftDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();

  const handleDone = (aircraft: Aircraft) => {
    onOpenChange(false);
    router.push(`/aircraft/${aircraft.id}/dashboard`);
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add aircraft</DialogTitle>
          <DialogDescription>
            Create a new aircraft, or join a shared one by tail number or with
            an invite code.
          </DialogDescription>
        </DialogHeader>
        <AddOrJoinAircraft
          onDone={handleDone}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
