export type IssueSummaryPromptFacts = {
  issue_type_name: string;
  location_label: string;
  times_observed: number;
  last_seen_phrase: string;
};

export function lastSeenPhraseFromFlightsSince(flightsSince: number): string {
  if (flightsSince <= 1) return "Current preflight";
  return `${flightsSince} flights ago`;
}

/**
 * Locked template: structured facts only — no transcript or free-text tails.
 * The forbidden-words list and BAD/GOOD counter-examples are load-bearing for
 * suppressing safety advice and severity-class leakage; do not weaken either
 * section without re-running production verification.
 */
export function buildIssueSummaryPrompt(facts: IssueSummaryPromptFacts): string {
  const n = Math.max(1, facts.times_observed);
  return [
    "You summarize one aircraft preflight issue for a pilot checklist UI.",
    "Write exactly two short sentences in plain English. State only: what the issue is, where it is, how often it has been observed, and how recently. Use only the structured fields below.",
    "",
    "Strict rules:",
    "- Do not give recommendations, advice, urgency cues, or risk assessments.",
    "- Never use any of these words: should, must, consider, danger, safety, immediate, attention, ground, urgent, severe, important, recommend, suggest, advise, critical, cosmetic.",
    "- Do not describe the issue as critical, cosmetic, minor, major, serious, or any other severity label.",
    "- Do not tell the pilot what to do. Just describe the facts.",
    "",
    "Examples of BAD outputs (do not produce anything like these):",
    'BAD: "There is a critical vibration issue detected in the left wing during the current preflight. This has been logged once and needs immediate attention before flight."',
    'BAD: "A serious oil leak is present on the fuselage that should be addressed immediately."',
    'BAD: "A cosmetic dent is on the right wing — minor concern only."',
    "",
    "Examples of GOOD outputs (match this style):",
    'GOOD: "A vibration was reported in the left wing during the current preflight. This is the first time it has been recorded."',
    'GOOD: "An oil leak has been observed on the fuselage during the current preflight. This is the third time it has been recorded on this aircraft."',
    'GOOD: "A dent was reported on the right wing two flights ago. It has been observed once."',
    "",
    `Issue type: ${facts.issue_type_name}`,
    `Location: ${facts.location_label}`,
    `Times logged or re-confirmed (logged + still): ${n}`,
    `Last seen: ${facts.last_seen_phrase}`,
  ].join("\n");
}

/** Two-sentence heuristic: at least two trimmed segments after split on sentence boundaries. */
export function validateIssueSummaryOutput(text: string): boolean {
  const t = text.trim();
  if (t.length < 16 || t.length > 520) return false;
  const parts = t.split(/(?<=[.!?])\s+/).filter((p) => p.length >= 4);
  return parts.length >= 2 && parts.length <= 4;
}
