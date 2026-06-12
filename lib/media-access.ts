/**
 * Shared Aircraft — Phase 4: gating co-pilot media views.
 *
 * Storage RLS is user-PATH-scoped (users/<uploader_uid>/…), so a co-pilot
 * cannot sign a URL over another pilot's media. The fix is to mint VIEW
 * signed URLs with the SERVICE-ROLE client — which bypasses storage RLS —
 * but ONLY after verifying the requester is a member of the media's OWN
 * aircraft.
 *
 * This pure gate makes that rule explicit and unit-testable: the
 * service-role mint is allowed IFF the requester is a member of the
 * specific aircraft the media belongs to. The caller MUST compute
 * `isMemberOfMediaAircraft` against the media's own aircraft (session →
 * aircraft_id, or media_assets.aircraft_id for checklist) — never a global
 * "member of anything" check.
 */
export type MediaViewGate =
  | { allow: true }
  | { allow: false; reason: "not_member" };

export function gateMediaView(isMemberOfMediaAircraft: boolean): MediaViewGate {
  return isMemberOfMediaAircraft
    ? { allow: true }
    : { allow: false, reason: "not_member" };
}
