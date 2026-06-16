import { describe, expect, it } from "vitest";

import {
  formatObservationLine,
  shapeObservation,
} from "@/lib/previous-session";

describe("A2 — previous-session observation shaping", () => {
  it("shapeObservation maps a full row to the render model", () => {
    expect(
      shapeObservation({
        id: "obs-1",
        created_at: "2026-06-03T10:00:00.000Z",
        issue: {
          location: "Left Wing",
          current_status: "active",
          issue_type: { name: "Oil Leak" },
        },
      }),
    ).toEqual({
      id: "obs-1",
      type: "Oil Leak",
      location: "Left Wing",
      status: "Active",
    });
  });

  it("maps resolved status to 'Resolved'", () => {
    const o = shapeObservation({
      id: "obs-2",
      issue: {
        location: "Tail",
        current_status: "resolved",
        issue_type: { name: "Crack" },
      },
    });
    expect(o?.status).toBe("Resolved");
  });

  it("falls back to defaults for missing type/location", () => {
    expect(
      shapeObservation({
        id: "obs-3",
        issue: { location: null, current_status: "active", issue_type: null },
      }),
    ).toEqual({
      id: "obs-3",
      type: "Issue",
      location: "Location not specified",
      status: "Active",
    });
  });

  it("trims whitespace-only type/location to defaults", () => {
    expect(
      shapeObservation({
        id: "obs-4",
        issue: {
          location: "   ",
          current_status: "active",
          issue_type: { name: "  " },
        },
      }),
    ).toEqual({
      id: "obs-4",
      type: "Issue",
      location: "Location not specified",
      status: "Active",
    });
  });

  it("returns null when id is missing (unrenderable row)", () => {
    expect(
      shapeObservation({
        issue: {
          location: "Nose",
          current_status: "active",
          issue_type: { name: "Dent" },
        },
      }),
    ).toBeNull();
  });

  it("returns null when the joined issue is missing (orphan observation)", () => {
    expect(shapeObservation({ id: "obs-5", issue: null })).toBeNull();
  });

  it("formatObservationLine renders 'type · location · status'", () => {
    expect(
      formatObservationLine({
        id: "x",
        type: "Oil Leak",
        location: "Fuselage",
        status: "Active",
      }),
    ).toBe("Oil Leak · Fuselage · Active");
  });
});
