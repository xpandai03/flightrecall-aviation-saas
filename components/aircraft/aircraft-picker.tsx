"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AddAircraftDialog } from "@/components/aircraft/add-aircraft-dialog";
import type { Aircraft } from "@/lib/types/database";

export function AircraftPicker({
  aircraft,
}: {
  aircraft: Aircraft[];
}) {
  const router = useRouter();
  const params = useParams<{ id?: string }>();
  const currentId = params.id ?? null;
  const current = aircraft.find((a) => a.id === currentId) ?? null;

  const [dialogOpen, setDialogOpen] = React.useState(false);

  const triggerLabel = current
    ? current.tail_number
    : aircraft.length === 0
      ? "No aircraft"
      : "Choose aircraft";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-full text-xs gap-1.5 px-3"
          >
            <span className="font-semibold tracking-wide">{triggerLabel}</span>
            <ChevronsUpDown className="size-3 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Your aircraft
          </DropdownMenuLabel>
          {aircraft.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              None yet
            </div>
          )}
          {aircraft.map((a) => (
            <DropdownMenuItem
              key={a.id}
              onSelect={() => {
                router.push(`/aircraft/${a.id}/dashboard`);
              }}
              className="cursor-pointer"
            >
              <span className="flex-1 font-medium tracking-tight">
                {a.tail_number}
              </span>
              {a.id === currentId && <Check className="size-3.5 text-sky-600" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setDialogOpen(true);
            }}
            className="cursor-pointer text-sky-700"
          >
            <Plus className="size-3.5" />
            Add aircraft
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AddAircraftDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
