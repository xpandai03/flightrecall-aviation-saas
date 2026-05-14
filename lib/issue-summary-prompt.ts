export type IssueSummaryPromptFacts = {
  issue_type_name: string;
  location_label: string;
  times_observed: number;
  last_seen_phrase: string;
  severity_class: string;
};

export function lastSeenPhraseFromFlightsSince(flightsSince: number): string {
  if (flightsSince <= 1) return "Current preflight";
  return `${flightsSince} flights ago`;
}

/**
 * Locked template: structured facts only — no transcript or free-text tails.
 * Used for regression tests; keep wording stable unless product intentionally changes.
 */
export function buildIssueSummaryPrompt(facts: IssueSummaryPromptFacts): string {
  const n = Math.max(1, facts.times_observed);
  return [
    "You summarize one aircraft preflight issue for a pilot checklist UI.",
    "Rules: exactly two short sentences, plain English, no bullets, no labels, no numbers not implied below.",
    "Do not invent facts; use only the structured fields.",
    "",
    `Issue type: ${facts.issue_type_name}`,
    `Location: ${facts.location_label}`,
    `Times logged or re-confirmed (logged + still): ${n}`,
    `Last seen: ${facts.last_seen_phrase}`,
    `Severity bucket: ${facts.severity_class}`,
  ].join("\n");
}

/** Two-sentence heuristic: at least two trimmed segments after split on sentence boundaries. */
export function validateIssueSummaryOutput(text: string): boolean {
  const t = text.trim();
  if (t.length < 16 || t.length > 520) return false;
  const parts = t.split(/(?<=[.!?])\s+/).filter((p) => p.length >= 4);
  return parts.length >= 2 && parts.length <= 4;
}
