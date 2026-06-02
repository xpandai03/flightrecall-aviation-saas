import { describe, expect, it } from "vitest";

import {
  CHECKLIST_CAP,
  canAddChecklist,
  hasChecklist,
  selectChecklistEvictions,
  visibleChecklist,
} from "@/lib/checklist";

const img = (id: string, iso: string) => ({ id, created_at: iso });

describe("checklist — cap + replace semantics", () => {
  it("cap is 2 (front + back)", () => {
    expect(CHECKLIST_CAP).toBe(2);
  });

  it("no eviction within the cap", () => {
    expect(selectChecklistEvictions([])).toEqual([]);
    expect(
      selectChecklistEvictions([img("a", "2026-06-01T00:00:00Z")]),
    ).toEqual([]);
    expect(
      selectChecklistEvictions([
        img("a", "2026-06-01T00:00:00Z"),
        img("b", "2026-06-02T00:00:00Z"),
      ]),
    ).toEqual([]);
  });

  it("a 3rd upload evicts the OLDEST (replace, keep newest 2)", () => {
    const evict = selectChecklistEvictions([
      img("old", "2026-06-01T00:00:00Z"),
      img("mid", "2026-06-02T00:00:00Z"),
      img("new", "2026-06-03T00:00:00Z"),
    ]);
    expect(evict).toEqual(["old"]);
  });

  it("multiple over-cap uploads evict all but the newest 2 (order-independent input)", () => {
    const evict = selectChecklistEvictions([
      img("c", "2026-06-03T00:00:00Z"),
      img("a", "2026-06-01T00:00:00Z"),
      img("d", "2026-06-04T00:00:00Z"),
      img("b", "2026-06-02T00:00:00Z"),
    ]);
    expect(new Set(evict)).toEqual(new Set(["a", "b"]));
  });

  it("visibleChecklist returns newest-first, capped", () => {
    const vis = visibleChecklist([
      img("a", "2026-06-01T00:00:00Z"),
      img("c", "2026-06-03T00:00:00Z"),
      img("b", "2026-06-02T00:00:00Z"),
    ]);
    expect(vis.map((v) => v.id)).toEqual(["c", "b"]);
  });

  it("hasChecklist / canAddChecklist drive the dashboard affordance", () => {
    expect(hasChecklist([])).toBe(false);
    expect(hasChecklist([img("a", "2026-06-01T00:00:00Z")])).toBe(true);
    expect(canAddChecklist(0)).toBe(true);
    expect(canAddChecklist(1)).toBe(true);
    expect(canAddChecklist(2)).toBe(false);
  });
});
