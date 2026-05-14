import "server-only";
import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";

import { computeFlightsSince } from "@/lib/active-issues-load";
import { isRecurrenceAction } from "@/lib/dashboard-issue-ranking";
import {
  buildIssueSummaryPrompt,
  lastSeenPhraseFromFlightsSince,
  validateIssueSummaryOutput,
} from "@/lib/issue-summary-prompt";

export type { IssueSummaryPromptFacts } from "@/lib/issue-summary-prompt";
export {
  buildIssueSummaryPrompt,
  lastSeenPhraseFromFlightsSince,
  validateIssueSummaryOutput,
} from "@/lib/issue-summary-prompt";

const SUMMARY_MODEL = "gpt-4o-mini";
const SUMMARY_TEMPERATURE = 0.3;
const SUMMARY_MAX_TOKENS = 100;
const OPENAI_TIMEOUT_MS = 10_000;

function getChatClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  return new OpenAI({ apiKey: key, timeout: OPENAI_TIMEOUT_MS });
}

function errorStatus(err: unknown): number | undefined {
  if (err && typeof err === "object" && "status" in err) {
    const s = (err as { status?: unknown }).status;
    if (typeof s === "number") return s;
  }
  return undefined;
}

function isRetryableStatus(status: number | undefined): boolean {
  return status === 429 || (status !== undefined && status >= 500);
}

async function markSummaryAttemptFinished(
  supabase: SupabaseClient,
  issueId: string,
): Promise<void> {
  await supabase
    .from("issues")
    .update({ ai_summary_updated_at: new Date().toISOString() })
    .eq("id", issueId);
}

async function callModelWithRetry(
  client: OpenAI,
  userPrompt: string,
): Promise<string | null> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content:
        "You write concise operational summaries for pilots. Output plain English only.",
    },
    { role: "user", content: userPrompt },
  ];

  const run = () =>
    client.chat.completions.create({
      model: SUMMARY_MODEL,
      temperature: SUMMARY_TEMPERATURE,
      max_tokens: SUMMARY_MAX_TOKENS,
      messages,
    });

  try {
    const res = await run();
    return res.choices[0]?.message?.content?.trim() ?? null;
  } catch (first) {
    const st = errorStatus(first);
    if (!isRetryableStatus(st)) throw first;
    await new Promise((r) => setTimeout(r, 1000));
    const res = await run();
    return res.choices[0]?.message?.content?.trim() ?? null;
  }
}

import type { IssueSummaryPromptFacts } from "@/lib/issue-summary-prompt";

async function loadSummaryPromptFacts(
  supabase: SupabaseClient,
  issueId: string,
): Promise<{
  promptFacts: import("@/lib/issue-summary-prompt").IssueSummaryPromptFacts;
} | null> {
  const { data: issue, error: issErr } = await supabase
    .from("issues")
    .select(
      "id, last_seen_at, aircraft_id, location, issue_type:issue_types(name, severity_class)",
    )
    .eq("id", issueId)
    .maybeSingle();

  if (issErr || !issue) return null;

  const [sessionsRes, obsRes] = await Promise.all([
    supabase
      .from("preflight_sessions")
      .select("created_at")
      .eq("aircraft_id", issue.aircraft_id)
      .order("created_at", { ascending: true }),
    supabase.from("issue_observations").select("action").eq("issue_id", issueId),
  ]);

  if (sessionsRes.error || obsRes.error) return null;

  const sessionTimes = (sessionsRes.data ?? []).map((s) =>
    new Date(s.created_at).getTime(),
  );
  const flightsSince = computeFlightsSince(issue.last_seen_at, sessionTimes);
  const recurrence_count = (obsRes.data ?? []).filter((o) =>
    isRecurrenceAction(o.action),
  ).length;

  const rawType = issue.issue_type as unknown;
  const itRow = Array.isArray(rawType) ? rawType[0] : rawType;
  const it = itRow as { name: string; severity_class: string } | null;
  if (!it?.name?.trim()) return null;

  return {
    promptFacts: {
      issue_type_name: it.name.trim(),
      location_label: issue.location?.trim() || "Not specified",
      times_observed: recurrence_count,
      last_seen_phrase: lastSeenPhraseFromFlightsSince(flightsSince),
      severity_class: it.severity_class,
    },
  };
}

/**
 * Generates and persists a two-sentence `issues.ai_summary`, or only bumps
 * `ai_summary_updated_at` on hard failure so the UI can leave the spinner.
 */
export async function generateIssueSummary(
  supabase: SupabaseClient,
  issueId: string,
): Promise<void> {
  const client = getChatClient();
  if (!client) {
    await markSummaryAttemptFinished(supabase, issueId);
    return;
  }

  try {
    const loaded = await loadSummaryPromptFacts(supabase, issueId);
    if (!loaded) {
      await markSummaryAttemptFinished(supabase, issueId);
      return;
    }

    const userPrompt = buildIssueSummaryPrompt(loaded.promptFacts);
    const text = await callModelWithRetry(client, userPrompt);

    if (!text || !validateIssueSummaryOutput(text)) {
      await markSummaryAttemptFinished(supabase, issueId);
      return;
    }

    await supabase
      .from("issues")
      .update({
        ai_summary: text,
        ai_summary_updated_at: new Date().toISOString(),
      })
      .eq("id", issueId);
  } catch (err) {
    console.error("[issue-summary] generation failed", {
      issue_id: issueId,
      message: err instanceof Error ? err.message : String(err),
    });
    await markSummaryAttemptFinished(supabase, issueId);
  }
}
