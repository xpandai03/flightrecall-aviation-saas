"use client";

import * as React from "react";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LOCATION_LABELS } from "@/lib/issue-taxonomy";
import { updateIssue } from "@/lib/api/issues";
import type { IssueType, IssueWithType } from "@/lib/types/database";

const NO_LOCATION_VALUE = "__no_location__";

export type ExtractedIssueRowProps = {
  issue: IssueWithType;
  /** Pre-loaded by parent; passed as prop to avoid per-row fetches. */
  issueTypes: IssueType[];
  /** Confirmed-success only: parent updates its own list with the
   *  server-returned row. */
  onUpdated: (next: IssueWithType) => void;
  /** Parent owns optimistic remove (see Confirmation panel). The row
   *  just signals intent; parent decides whether to fade/hide. */
  onRemoveRequest: (issueId: string) => void;
  /** When the parent is mid-removing this row, hide its action
   *  buttons so the user can't double-click. */
  removing?: boolean;
};

type Mode = "view" | "editing" | "saving";

/**
 * One row in the Confirmation screen's "Extracted issues" list. The
 * underlying issues row already exists in the database — this is an
 * audit-and-edit affordance, not a preview-then-persist staging UI.
 *
 * Edit mode swaps in two Selects (issue_type grouped by category,
 * location flat alphabetical with a "(no location)" option). Save is
 * optimistic: row flips to view mode immediately, then PATCH fires.
 * On 409 (unique constraint conflict on the new (type, location)
 * combo), rollback + targeted toast directing the user to the
 * existing issue. On other errors: rollback + generic toast.
 *
 * displayIssue is read on mount via lazy useState init only —
 * subsequent prop changes (e.g. parent re-fetches) are ignored so the
 * user's saved edit isn't clobbered by a stale fetch landing late.
 */
export function ExtractedIssueRow({
  issue,
  issueTypes,
  onUpdated,
  onRemoveRequest,
  removing = false,
}: ExtractedIssueRowProps) {
  const [displayIssue, setDisplayIssue] = React.useState<IssueWithType>(
    () => issue,
  );
  const [mode, setMode] = React.useState<Mode>("view");
  const [draftTypeId, setDraftTypeId] = React.useState<string>(issue.issue_type_id);
  const [draftLocation, setDraftLocation] = React.useState<string | null>(
    issue.location,
  );

  const groupedTypes = React.useMemo(() => groupTypesByCategory(issueTypes), [
    issueTypes,
  ]);

  const enterEdit = () => {
    setDraftTypeId(displayIssue.issue_type_id);
    setDraftLocation(displayIssue.location);
    setMode("editing");
  };

  const cancel = () => {
    setMode("view");
  };

  const save = async () => {
    if (mode === "saving") return;
    const noTypeChange = draftTypeId === displayIssue.issue_type_id;
    const noLocationChange = draftLocation === displayIssue.location;
    if (noTypeChange && noLocationChange) {
      setMode("view");
      return;
    }

    const previous = displayIssue;
    // Optimistic swap. We synthesize a temporary IssueWithType with
    // the new type joined in — parent will overwrite with the
    // authoritative server response on success.
    const draftType =
      issueTypes.find((t) => t.id === draftTypeId) ?? displayIssue.issue_type;
    const optimisticNext: IssueWithType = {
      ...displayIssue,
      issue_type_id: draftTypeId,
      issue_type: draftType,
      location: draftLocation,
    };
    setDisplayIssue(optimisticNext);
    setMode("saving");

    try {
      const updated = await updateIssue(displayIssue.id, {
        ...(noTypeChange ? {} : { issue_type_id: draftTypeId }),
        ...(noLocationChange ? {} : { location: draftLocation }),
      });
      setDisplayIssue(updated);
      setMode("view");
      onUpdated(updated);
      toast.success("Issue updated.");
    } catch (err) {
      setDisplayIssue(previous);
      setMode("editing");
      const message = err instanceof Error ? err.message : String(err);
      const isConflict = message.includes("409");
      if (isConflict) {
        toast.error(
          "This issue type already exists at that location for this aircraft. Edit the existing one instead, or pick a different location.",
        );
      } else {
        toast.error("Couldn't save changes. Try again.");
      }
    }
  };

  const handleRemove = () => {
    if (removing) return;
    onRemoveRequest(displayIssue.id);
  };

  if (mode === "editing" || mode === "saving") {
    const saving = mode === "saving";
    return (
      <div className="space-y-3 rounded-lg border border-border/60 bg-card px-4 py-3">
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Type
          </label>
          <Select
            value={draftTypeId}
            onValueChange={setDraftTypeId}
            disabled={saving}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {groupedTypes.map((group) => (
                <SelectGroup key={group.category}>
                  <SelectLabel>{group.label}</SelectLabel>
                  {group.types.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Location
          </label>
          <Select
            value={draftLocation ?? NO_LOCATION_VALUE}
            onValueChange={(v) =>
              setDraftLocation(v === NO_LOCATION_VALUE ? null : v)
            }
            disabled={saving}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_LOCATION_VALUE}>(no location)</SelectItem>
              {LOCATION_LABELS.map((loc) => (
                <SelectItem key={loc} value={loc}>
                  {loc}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={cancel}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={save}
            disabled={saving}
          >
            {saving && <Loader2 className="size-3.5 animate-spin" />}
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-card px-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground truncate">
          {displayIssue.issue_type.name}
        </div>
        <div className="text-xs mt-0.5">
          {displayIssue.location ? (
            <span className="text-muted-foreground">{displayIssue.location}</span>
          ) : (
            <span className="italic text-muted-foreground">no location</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={enterEdit}
          disabled={removing}
          className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
          aria-label="Edit issue"
        >
          <Pencil className="size-3" />
          Edit
        </button>
        <button
          type="button"
          onClick={handleRemove}
          disabled={removing}
          className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
          aria-label="Remove issue"
        >
          <Trash2 className="size-3" />
          Remove
        </button>
      </div>
    </div>
  );
}

type CategoryGroup = {
  category: string;
  label: string;
  types: IssueType[];
};

const CATEGORY_LABEL: Record<string, string> = {
  engine_oil: "Engine / Oil",
  structural: "Structural",
  landing_gear: "Landing Gear",
  fuel: "Fuel",
  electrical: "Electrical",
  flight_controls: "Flight Controls",
  general_safety: "General / Safety",
};

function groupTypesByCategory(types: IssueType[]): CategoryGroup[] {
  const buckets = new Map<string, IssueType[]>();
  for (const t of types) {
    const key = t.category ?? "other";
    const arr = buckets.get(key) ?? [];
    arr.push(t);
    buckets.set(key, arr);
  }
  // Stable order for the dropdown — matches the Phase 2 taxonomy order.
  const order = [
    "engine_oil",
    "structural",
    "landing_gear",
    "fuel",
    "electrical",
    "flight_controls",
    "general_safety",
    "other",
  ];
  const out: CategoryGroup[] = [];
  for (const key of order) {
    const items = buckets.get(key);
    if (!items || items.length === 0) continue;
    out.push({
      category: key,
      label: CATEGORY_LABEL[key] ?? key,
      types: items.slice().sort((a, b) => a.name.localeCompare(b.name)),
    });
  }
  return out;
}
