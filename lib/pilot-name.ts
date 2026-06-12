/**
 * Phase 3 attribution — render a creator's display name for "logged by
 * {pilot}". first_name only; NEVER an email. Falls back to a neutral label
 * when no name is known (a co-member whose profile isn't populated yet, or
 * a historical row). Pure + shared between surfaces.
 */
export const UNKNOWN_PILOT = "A pilot";

export function displayPilotName(
  firstName: string | null | undefined,
): string {
  const trimmed = firstName?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : UNKNOWN_PILOT;
}

/** "logged by {name}" / "marked fixed by {name}" helper. */
export function loggedByLabel(
  firstName: string | null | undefined,
  prefix = "Logged by",
): string {
  return `${prefix} ${displayPilotName(firstName)}`;
}
