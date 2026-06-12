import { describe, expect, it } from "vitest";

import { gateMediaView } from "@/lib/media-access";

/**
 * Phase 4 — the service-role view-URL mint is allowed IFF the requester is
 * a member of the MEDIA'S OWN aircraft. The route computes the boolean via
 * isMemberOfAircraft(userClient, <media's aircraft>) (RLS-honest); this
 * pins the decision the mint is gated on.
 */
describe("gateMediaView — service-role mint gate", () => {
  it("member of the media's aircraft → allow (mint proceeds)", () => {
    expect(gateMediaView(true)).toEqual({ allow: true });
  });

  it("NON-member → deny (no mint)", () => {
    expect(gateMediaView(false)).toEqual({ allow: false, reason: "not_member" });
  });

  it("cross-aircraft: a member of a DIFFERENT aircraft is not a member of THIS media's aircraft → deny", () => {
    // The route always passes membership computed against the media's own
    // aircraft. A pilot who belongs only to aircraft Y, requesting media of
    // aircraft X, yields isMemberOfMediaAircraft=false here → denied. The
    // gate never receives a global "member of anything" boolean.
    const isMemberOfThisMediasAircraft = false; // member of Y, media is X
    expect(gateMediaView(isMemberOfThisMediasAircraft)).toEqual({
      allow: false,
      reason: "not_member",
    });
  });
});
