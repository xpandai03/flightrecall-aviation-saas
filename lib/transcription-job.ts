import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { transcribeAudio } from "@/lib/whisper";
import {
  extractIssues,
  type ExtractedIssue,
} from "@/lib/issue-extraction";
import { generateIssueSummary } from "@/lib/issue-summarization";
import { selectIssueForExtraction } from "@/lib/issue-resurrection";

const BUCKET = "flight-recall-media";

type StartArgs = {
  supabase: SupabaseClient;
  media_asset_id: string;
  preflight_session_id: string;
  storage_key: string;
  file_name: string | null;
};

type StartResult =
  | { ok: true; voice_transcription_id: string; alreadyExists: boolean }
  | { ok: false; status: number; error: string };

/**
 * Insert (or fetch existing) voice_transcriptions row for an audio media asset.
 * Caller is responsible for scheduling `runTranscription` via Next 16 `after()`
 * once this returns ok and `alreadyExists === false`.
 */
export async function startTranscription(
  args: StartArgs,
): Promise<StartResult> {
  const { supabase, media_asset_id, preflight_session_id } = args;

  const existing = await supabase
    .from("voice_transcriptions")
    .select("id")
    .eq("media_asset_id", media_asset_id)
    .maybeSingle();

  if (existing.error) {
    return { ok: false, status: 500, error: existing.error.message };
  }
  if (existing.data) {
    return {
      ok: true,
      voice_transcription_id: existing.data.id,
      alreadyExists: true,
    };
  }

  const { data, error } = await supabase
    .from("voice_transcriptions")
    .insert({
      media_asset_id,
      preflight_session_id,
      transcription_status: "pending",
    })
    .select("id")
    .single();

  if (error || !data) {
    return {
      ok: false,
      status: 500,
      error: error?.message ?? "Failed to insert transcription row",
    };
  }
  return { ok: true, voice_transcription_id: data.id, alreadyExists: false };
}

type RunArgs = {
  supabase: SupabaseClient;
  voice_transcription_id: string;
  preflight_session_id: string;
  media_asset_id: string;
  storage_key: string;
  file_name: string | null;
  /** Photo-attached voice: transcribe only — no extraction or description backfill. */
  skipKeywordExtraction?: boolean;
};

/**
 * Long-running half. Downloads the audio via a server-minted signed URL,
 * sends it to Whisper, writes the result back. Designed to be invoked
 * inside `after()` so the originating request has already returned.
 *
 * Never throws. All failure paths land as voice_transcriptions.status='failed'.
 */
export async function runTranscription(args: RunArgs): Promise<void> {
  const {
    supabase,
    voice_transcription_id,
    preflight_session_id,
    media_asset_id,
    storage_key,
    file_name,
    skipKeywordExtraction = false,
  } = args;

  console.log("[transcription] entry", {
    voice_transcription_id,
    preflight_session_id,
    storage_key,
  });

  await supabase
    .from("voice_transcriptions")
    .update({
      transcription_status: "processing",
      started_at: new Date().toISOString(),
    })
    .eq("id", voice_transcription_id);

  try {
    const { data: signed, error: signedErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storage_key, 60);
    if (signedErr || !signed?.signedUrl) {
      throw new Error(
        `signed download URL failed: ${signedErr?.message ?? "unknown"}`,
      );
    }
    const audioRes = await fetch(signed.signedUrl);
    if (!audioRes.ok) {
      throw new Error(`audio download failed: ${audioRes.status}`);
    }
    const buf = Buffer.from(await audioRes.arrayBuffer());
    const safeName = file_name && file_name.length > 0 ? file_name : "voice-note.webm";

    const result = await transcribeAudio(buf, safeName);

    await supabase
      .from("voice_transcriptions")
      .update({
        transcription_status: "completed",
        transcript_text: result.text,
        language: result.language,
        duration_seconds: result.duration_seconds,
        model: result.model,
        completed_at: new Date().toISOString(),
      })
      .eq("id", voice_transcription_id);

    // Multi-input sessions can carry many voice notes; the canonical
    // transcript lives on voice_transcriptions, not on the session row.
    // (Pre-Phase-1 behavior wrote result.text to preflight_sessions.transcript_text,
    // which would silently overwrite an earlier note's transcript on the
    // second voice in a multi-input session.) summarizeSession() already
    // prefers voice_transcriptions[0].transcript_text and falls back to
    // the session column for legacy single-input rows.

    if (!skipKeywordExtraction) {
      // M2 Phase 2: deterministic keyword extraction. Best-effort —
      // extraction failures are logged but never flip the transcription
      // to 'failed'. Transcription is the higher-priority path; extracted
      // issues are an additive convenience.
      try {
        const extracted = extractIssues(result.text);
        if (extracted.length > 0) {
          await persistExtractedIssues(supabase, {
            preflight_session_id,
            extracted,
          });
        }
      } catch (err) {
        console.error("[transcription] extraction failed", {
          voice_transcription_id,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // If this audio was tagged at upload time, the issue exists with a null
      // description. Backfill it from the transcript (overwrite unconditionally
      // so the most recent voice note wins). Best-effort.
      const { data: media, error: mediaErr } = await supabase
        .from("media_assets")
        .select("issue_id")
        .eq("id", media_asset_id)
        .maybeSingle();
      if (mediaErr) {
        console.error("[transcription] issue lookup failed", {
          media_asset_id,
          error: mediaErr.message,
        });
      } else if (media?.issue_id) {
        const { error: descErr } = await supabase
          .from("issues")
          .update({ description: result.text.slice(0, 500) })
          .eq("id", media.issue_id);
        if (descErr) {
          console.error("[transcription] description backfill failed", {
            issue_id: media.issue_id,
            error: descErr.message,
          });
        }
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[transcription] failed", {
      voice_transcription_id,
      error: message,
    });
    await supabase
      .from("voice_transcriptions")
      .update({
        transcription_status: "failed",
        error_message: message.slice(0, 500),
        completed_at: new Date().toISOString(),
      })
      .eq("id", voice_transcription_id);
  }
}

const RAW_TRANSCRIPT_MAX_CHARS = 4_000;

/**
 * Persist a batch of ExtractedIssue rows produced by lib/issue-extraction
 * for a given preflight session. Idempotent against re-runs:
 *   - issues row keyed by (aircraft_id, issue_type_id, location IS [NOT] NULL)
 *   - observations skipped if (issue_id, session_id, action='logged')
 *     already exists.
 *
 * Errors per-issue are logged and the loop continues — one bad slug
 * lookup shouldn't drop the rest of the extracted issues.
 */
async function persistExtractedIssues(
  supabase: SupabaseClient,
  args: {
    preflight_session_id: string;
    extracted: ExtractedIssue[];
  },
): Promise<void> {
  const { preflight_session_id, extracted } = args;

  const { data: session, error: sesErr } = await supabase
    .from("preflight_sessions")
    .select("id, aircraft_id")
    .eq("id", preflight_session_id)
    .maybeSingle();
  if (sesErr || !session) {
    console.error("[extraction] session lookup failed", {
      preflight_session_id,
      error: sesErr?.message,
    });
    return;
  }

  for (const ex of extracted) {
    try {
      await persistOne(supabase, {
        aircraft_id: session.aircraft_id,
        preflight_session_id,
        extracted: ex,
      });
    } catch (err) {
      console.error("[extraction] issue persist failed", {
        type_slug: ex.type_slug,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

async function persistOne(
  supabase: SupabaseClient,
  args: {
    aircraft_id: string;
    preflight_session_id: string;
    extracted: ExtractedIssue;
  },
): Promise<void> {
  const { aircraft_id, preflight_session_id, extracted } = args;

  // Resolve issue_type by slug. Defensive: spec slugs should all exist
  // post-migration, but skip silently if not.
  const { data: type, error: typeErr } = await supabase
    .from("issue_types")
    .select("id")
    .eq("slug", extracted.type_slug)
    .maybeSingle();
  if (typeErr) throw new Error(`issue_type lookup: ${typeErr.message}`);
  if (!type) {
    console.error("[extraction] unknown issue_type slug", {
      type_slug: extracted.type_slug,
    });
    return;
  }

  // Lookup every issue row matching (aircraft, type, location),
  // regardless of status. Postgres treats NULLs as distinct in unique
  // indexes, so we manually distinguish ".eq" vs ".is null" — same
  // pattern as the legacy upsertIssueForMedia path.
  //
  // We deliberately do NOT use .maybeSingle() here: a resolved row and
  // an active row may legitimately coexist for the same key. The
  // reuse-vs-insert decision is delegated to selectIssueForExtraction,
  // which only ever reuses an ACTIVE row — a resolved match is left
  // untouched and a fresh issue is inserted instead. This is the
  // resurrection fix: voice extraction never re-activates a resolved
  // issue.
  let lookupQuery = supabase
    .from("issues")
    .select("id, current_status")
    .eq("aircraft_id", aircraft_id)
    .eq("issue_type_id", type.id);
  lookupQuery =
    extracted.location === null
      ? lookupQuery.is("location", null)
      : lookupQuery.eq("location", extracted.location);

  const { data: candidates, error: lookupErr } = await lookupQuery;
  if (lookupErr) throw new Error(`issue lookup: ${lookupErr.message}`);

  const decision = selectIssueForExtraction(candidates ?? []);

  let issue_id: string;
  if (decision.action === "update") {
    const { data: updated, error: uErr } = await supabase
      .from("issues")
      .update({
        last_seen_at: new Date().toISOString(),
        current_status: "active",
        resolved_at: null,
      })
      .eq("id", decision.id)
      .select("id")
      .single();
    if (uErr || !updated) {
      throw new Error(`issue update: ${uErr?.message ?? "no row returned"}`);
    }
    issue_id = updated.id;
  } else {
    const nowIso = new Date().toISOString();
    const { data: created, error: cErr } = await supabase
      .from("issues")
      .insert({
        aircraft_id,
        issue_type_id: type.id,
        location: extracted.location,
        first_seen_at: nowIso,
        last_seen_at: nowIso,
        current_status: "active",
      })
      .select("id")
      .single();
    if (cErr || !created) {
      throw new Error(`issue insert: ${cErr?.message ?? "no row returned"}`);
    }
    issue_id = created.id;
  }

  // Observation idempotency: skip if a 'logged' obs already exists for
  // this (issue, session) pair. Re-running extraction on the same
  // transcript becomes a no-op for both tables.
  const { data: existingObs, error: obsLookupErr } = await supabase
    .from("issue_observations")
    .select("id")
    .eq("issue_id", issue_id)
    .eq("preflight_session_id", preflight_session_id)
    .eq("action", "logged")
    .maybeSingle();
  if (obsLookupErr) {
    throw new Error(`observation lookup: ${obsLookupErr.message}`);
  }
  if (existingObs) return;

  const { error: obsErr } = await supabase.from("issue_observations").insert({
    issue_id,
    preflight_session_id,
    action: "logged",
    raw_transcript: extracted.raw_transcript.slice(0, RAW_TRANSCRIPT_MAX_CHARS),
    summary: extracted.summary,
  });
  if (obsErr) {
    throw new Error(`observation insert: ${obsErr.message}`);
  }

  void generateIssueSummary(supabase, issue_id).catch((err) => {
    console.error("[extraction] issue summary follow-up failed", {
      issue_id,
      message: err instanceof Error ? err.message : String(err),
    });
  });
}
