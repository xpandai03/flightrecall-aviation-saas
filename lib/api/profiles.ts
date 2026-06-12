"use client";

/** Resolve creator user-ids → first names (RLS-scoped to co-members). */
export async function fetchProfiles(
  ids: string[],
): Promise<Record<string, string | null>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return {};
  const r = await fetch(`/api/v1/profiles?ids=${unique.join(",")}`, {
    cache: "no-store",
  });
  if (!r.ok) return {};
  const { profiles } = (await r.json()) as {
    profiles: { user_id: string; first_name: string | null }[];
  };
  const map: Record<string, string | null> = {};
  for (const p of profiles) map[p.user_id] = p.first_name;
  return map;
}
