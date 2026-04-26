import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

/**
 * Shared redirect logic for the root page AND the legacy URLs
 * (`/sessions`, `/memory`, `/dashboard`).
 *
 *   not signed in            → /login
 *   signed in, no aircraft   → /onboarding/add-aircraft
 *   signed in, has aircraft  → /aircraft/<lastUsed-or-first>/<page>
 *
 * The cookie `last_aircraft_id` is set by the aircraft layout on every
 * visit. If it points to an aircraft that no longer exists for this
 * user, RLS returns no rows and we fall back to the first aircraft
 * sorted by tail_number.
 */
export async function smartRedirect(page: "dashboard" | "sessions" | "memory") {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: aircraftRows } = await supabase
    .from("aircraft")
    .select("id")
    .order("tail_number", { ascending: true });
  const aircraft = aircraftRows ?? [];

  if (aircraft.length === 0) {
    redirect("/onboarding/add-aircraft");
  }

  const lastUsedId = cookieStore.get("last_aircraft_id")?.value ?? null;
  const targetId =
    (lastUsedId && aircraft.find((a) => a.id === lastUsedId)?.id) ??
    aircraft[0].id;

  redirect(`/aircraft/${targetId}/${page}`);
}
