/**
 * Phonetic correction of known Whisper MIS-HEARINGS of aviation jargon,
 * applied to the transcript string BEFORE the deterministic extractor scans
 * it (see lib/issue-extraction.ts extractIssues). NOT AI, NOT fuzzy — a
 * small, explicit, hardcoded phrase map only.
 *
 * Why: OpenAI Whisper occasionally transcribes uncommon aviation terms as
 * everyday words ("pitot tube" → "pilot tube" / "pedo tube"). The extractor
 * is correct; the INPUT word is wrong, so the location fails to bind. This
 * layer restores the intended term so extraction pairs it correctly.
 *
 * SAFETY MODEL — the whole point is to NOT corrupt benign speech:
 *  - Corrections are PHRASE-level with word boundaries, never single common
 *    words. "pilot" alone (a person) is NEVER rewritten — only the full
 *    mis-heard phrase "pilot tube".
 *  - Case-insensitive match; the replacement is fed to the extractor (which
 *    lowercases anyway), so output casing is irrelevant.
 *  - Idempotent + non-stacking: no correction's OUTPUT is another's INPUT
 *    (every target is the real term "pitot tube", which is not itself a
 *    key), so applying twice changes nothing and corrections never chain.
 *  - The ORIGINAL transcript is preserved by the caller — this returns a
 *    NEW string used only for scanning; issue_observations.raw_transcript
 *    and voice_transcriptions.transcript_text keep what Whisper produced.
 */

/**
 * { mis-heard phrase → correct aviation term }. Add an entry ONLY when the
 * mis-hearing is (a) a real Whisper output for an aviation term AND (b) not
 * legitimate English that could appear benignly. Each value is the term the
 * deterministic extractor's vocabulary already knows.
 *
 * Confirmed entries (this session):
 *  - "pilot tube" → "pitot tube": Whisper's most common pitot mishear. Safe
 *    because the bare word "pilot" is untouched; only the two-word phrase
 *    "pilot tube" (not a real object) maps. "copilot tube" / "autopilot
 *    tube" do NOT match (word boundary before "pilot").
 *  - "pedo tube"  → "pitot tube": phonetic mishear of "pitot"; "pedo tube"
 *    is not legitimate English, so there is no benign collision.
 *
 * Intentionally EXCLUDED / flagged for review (NOT added — see report):
 *  - Plurals ("pilot tubes"): the confirmed cases are singular and the
 *    location keyword is "pitot tube"; add only if Whisper plurals are seen.
 *  - "pita tube" / "peto tube" / "pirate tube": plausible but UNCONFIRMED
 *    Whisper outputs; excluded until observed, per the <95% rule.
 */
export const AVIATION_TRANSCRIPTION_CORRECTIONS: Record<string, string> = {
  "pilot tube": "pitot tube",
  "pedo tube": "pitot tube",
};

/** Escape a phrase for safe embedding in a RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build a word-bounded, case-insensitive matcher for a phrase. Internal
 * spaces become `\s+` so multi-space Whisper output still matches; `\b`
 * anchors both ends so the phrase only fires as whole words ("pilot tube",
 * never "copilot tube" or a "pilot"-only word).
 */
function phraseRegExp(phrase: string): RegExp {
  const pattern = phrase
    .trim()
    .split(/\s+/)
    .map(escapeRegExp)
    .join("\\s+");
  return new RegExp(`\\b${pattern}\\b`, "gi");
}

// Precompile once at module load — the map is tiny and static.
const COMPILED: { re: RegExp; correct: string }[] = Object.entries(
  AVIATION_TRANSCRIPTION_CORRECTIONS,
).map(([wrong, correct]) => ({ re: phraseRegExp(wrong), correct }));

/**
 * Return `text` with every known aviation mis-hearing replaced by its
 * correct term. Pure; the input is never mutated. Text outside the mapped
 * phrases is byte-for-byte unchanged. Idempotent and non-stacking (no
 * target is also a key).
 *
 * This is meant to feed the EXTRACTOR only — keep the original transcript
 * for storage/display.
 */
export function applyTranscriptionCorrections(text: string): string {
  if (!text) return text;
  let out = text;
  for (const { re, correct } of COMPILED) {
    re.lastIndex = 0; // defensive: a /g regex carries state across calls
    out = out.replace(re, correct);
  }
  return out;
}
