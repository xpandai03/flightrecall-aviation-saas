import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { selectIssueForExtraction } from "@/lib/issue-resurrection";

/**
 * Create-or-reuse the quick-tag issue for a tagged media asset and link
 * media_assets.issue_id to it. Shared by:
 *  - the media complete route (photo / standalone-voice quick-tag at upload), and
 *  - the transcription job's photo+voice FALLBACK (M4 Item 3): when an
 *    attached voice transcribes to nothing extractable, the photo's
 *    quick_tag still creates one issue.
 *
 * Extracted out of app/api/v1/media/[id]/complete/route.ts (verbatim) so
 * the background job can reuse it without a route↔job circular import.
 *
 * Resurrection-safe: matches every (aircraft, type, location IS NULL) row
 * and reuses only an ACTIVE one (selectIssueForExtraction); a resolved
 * match yields a fresh insert, never a silent re-activation.
 */
export async function upsertIssueForMedia(args: {
  supabase: SupabaseClient;
  media_asset_id: string;
  preflight_session_id: string;
  quick_tag: string;
}): Promise<{ ok: true; issue_id: string } | { ok: false; error: string }> {
  const { supabase, media_asset_id, preflight_session_id, quick_tag } = args;

  const { data: type, error: typeErr } = await supabase
    .from("issue_types")
    .select("id")
    .eq("slug", quick_tag)
    .maybeSingle();
  if (typeErr) return { ok: false, error: typeErr.message };
  if (!type) return { ok: false, error: `unknown issue_type slug: ${quick_tag}` };

  const { data: session, error: sesErr } = await supabase
    .from("preflight_sessions")
    .select("id, aircraft_id, created_at")
    .eq("id", preflight_session_id)
    .maybeSingle();
  if (sesErr) return { ok: false, error: sesErr.message };
  if (!session) return { ok: false, error: "session not found" };

  // Match every issue row for (aircraft, type) with a null location —
  // the legacy quick-tag path never sets location. No .maybeSingle():
  // a resolved row and an active row may now coexist for the same key.
  // selectIssueForExtraction reuses only an ACTIVE row, so a photo
  // quick-tag never re-activates a resolved issue — it inserts a fresh
  // one instead.
  const { data: candidates, error: lookupErr } = await supabase
    .from("issues")
    .select("id, current_status")
    .eq("aircraft_id", session.aircraft_id)
    .eq("issue_type_id", type.id)
    .is("location", null);
  if (lookupErr) return { ok: false, error: lookupErr.message };

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
      return { ok: false, error: uErr?.message ?? "issue update failed" };
    }
    issue_id = updated.id;
  } else {
    const nowIso = new Date().toISOString();
    const { data: created, error: cErr } = await supabase
      .from("issues")
      .insert({
        aircraft_id: session.aircraft_id,
        issue_type_id: type.id,
        first_seen_at: nowIso,
        last_seen_at: nowIso,
        current_status: "active",
      })
      .select("id")
      .single();
    if (cErr || !created) {
      return { ok: false, error: cErr?.message ?? "issue insert failed" };
    }
    issue_id = created.id;
  }

  const { error: linkErr } = await supabase
    .from("media_assets")
    .update({ issue_id })
    .eq("id", media_asset_id);
  if (linkErr) return { ok: false, error: linkErr.message };

  const { error: obsErr } = await supabase
    .from("issue_observations")
    .insert({
      issue_id,
      preflight_session_id,
      action: "logged",
    });
  if (obsErr) return { ok: false, error: obsErr.message };

  return { ok: true, issue_id };
}
