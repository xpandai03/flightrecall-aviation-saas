import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Minimal shape we read off the Supabase auth user. */
type ProfileUser = {
  id?: string;
  email?: string | null;
  user_metadata?: { first_name?: unknown } | null;
} | null;

/**
 * Derive a display first name from auth metadata, falling back to the
 * email local-part (capitalized). Mirrors the dashboard greeting. Returns
 * null when neither is available (the UI then shows a neutral fallback).
 */
export function deriveFirstName(user: ProfileUser): string | null {
  const meta = user?.user_metadata?.first_name;
  if (typeof meta === "string" && meta.trim().length > 0) {
    return meta.trim();
  }
  const email = user?.email;
  if (email) {
    const local = email.split("@")[0]?.trim();
    if (local) return local.charAt(0).toUpperCase() + local.slice(1);
  }
  return null;
}

/**
 * Phase 3 — lazily populate the caller's profile row so co-members can see
 * "logged by {first name}". Insert-if-missing (does NOT overwrite a name the
 * user already set). Best-effort: never throws / never blocks the request.
 * This is the no-migration backfill — every existing user gets a profile on
 * their next signed-in landing.
 */
export async function ensureProfile(
  supabase: SupabaseClient,
  user: ProfileUser,
): Promise<void> {
  if (!user?.id) return;
  try {
    await supabase
      .from("profiles")
      .upsert(
        { user_id: user.id, first_name: deriveFirstName(user) },
        { onConflict: "user_id", ignoreDuplicates: true },
      );
  } catch {
    // Attribution is non-critical; never let it break auth/redirect.
  }
}
