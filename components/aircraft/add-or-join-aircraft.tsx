"use client";

import * as React from "react";

import { AddAircraftForm } from "@/components/aircraft/add-aircraft-form";
import { JoinAircraftForm } from "@/components/aircraft/join-aircraft-form";
import type { Aircraft } from "@/lib/types/database";

/**
 * Two distinct paths in one place: CREATE a new aircraft, or JOIN an
 * existing shared one with an invite code. These are deliberately separate
 * (no auto-join on duplicate tail) — creating reuses the unchanged create
 * path; joining requires a secret code.
 */
export function AddOrJoinAircraft({
  onDone,
  onCancel,
  createCtaLabel,
}: {
  onDone: (aircraft: Aircraft) => void;
  onCancel?: () => void;
  createCtaLabel?: string;
}) {
  const [mode, setMode] = React.useState<"create" | "join">("create");

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Add or join aircraft"
        className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
      >
        <button
          role="tab"
          type="button"
          aria-selected={mode === "create"}
          onClick={() => setMode("create")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            mode === "create"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Create new
        </button>
        <button
          role="tab"
          type="button"
          aria-selected={mode === "join"}
          onClick={() => setMode("join")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            mode === "join"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Join with code
        </button>
      </div>

      {mode === "create" ? (
        <AddAircraftForm
          onCreated={onDone}
          onCancel={onCancel}
          autoFocus
          ctaLabel={createCtaLabel}
        />
      ) : (
        <JoinAircraftForm onJoined={onDone} onCancel={onCancel} autoFocus />
      )}
    </div>
  );
}
