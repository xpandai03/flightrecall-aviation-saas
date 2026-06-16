"use client";

import * as React from "react";

import { AddAircraftForm } from "@/components/aircraft/add-aircraft-form";
import { JoinAircraftForm } from "@/components/aircraft/join-aircraft-form";
import { JoinByTailForm } from "@/components/aircraft/join-by-tail-form";
import type { Aircraft } from "@/lib/types/database";

type Mode = "create" | "join-tail" | "join-code";

const TABS: { mode: Mode; label: string }[] = [
  { mode: "create", label: "Create new" },
  { mode: "join-tail", label: "Join by tail" },
  { mode: "join-code", label: "Join with code" },
];

/**
 * Three distinct paths in one place: CREATE a new aircraft, JOIN an existing
 * one by tail number + aircraft type (open join — owner-approved), or JOIN
 * with an invite code. All three are deliberately separate and all stay
 * available; open join is ADDED alongside the invite code, not a replacement.
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
  const [mode, setMode] = React.useState<Mode>("create");

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Add or join aircraft"
        className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1"
      >
        {TABS.map((tab) => (
          <button
            key={tab.mode}
            role="tab"
            type="button"
            aria-selected={mode === tab.mode}
            onClick={() => setMode(tab.mode)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === tab.mode
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {mode === "create" ? (
        <AddAircraftForm
          onCreated={onDone}
          onCancel={onCancel}
          autoFocus
          ctaLabel={createCtaLabel}
        />
      ) : mode === "join-tail" ? (
        <JoinByTailForm onJoined={onDone} onCancel={onCancel} autoFocus />
      ) : (
        <JoinAircraftForm onJoined={onDone} onCancel={onCancel} autoFocus />
      )}
    </div>
  );
}
