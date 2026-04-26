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
import { AddAircraftForm } from "@/components/aircraft/add-aircraft-form";
import type { Aircraft } from "@/lib/types/database";

export function AddAircraftDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();

  const handleCreated = (aircraft: Aircraft) => {
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
            Tail number is required. Type is optional and free-form.
          </DialogDescription>
        </DialogHeader>
        <AddAircraftForm
          onCreated={handleCreated}
          onCancel={() => onOpenChange(false)}
          autoFocus
        />
      </DialogContent>
    </Dialog>
  );
}
