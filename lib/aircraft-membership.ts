import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * RLS-HONEST membership check (Phase 4): does the requesting user belong to
 * `aircraftId`? Uses the caller's OWN (cookie/JWT) client, so the answer is
 * computed by the Phase 1 RLS policy `aircraft_select_member`
 * (= is_aircraft_member) — NOT a service-role read that could mask a
 * scoping bug. Returns true only if the user is a member of THIS specific
 * aircraft.
 *
 * This is the gate that must precede every service-role view-URL mint
 * (lib/media-access.ts gateMediaView): pass the result for the media's OWN
 * aircraft, never a global membership check.
 */
export async function isMemberOfAircraft(
  userSupabase: SupabaseClient,
  aircraftId: string,
): Promise<boolean> {
  const { data } = await userSupabase
    .from("aircraft")
    .select("id")
    .eq("id", aircraftId)
    .maybeSingle();
  return Boolean(data);
}
