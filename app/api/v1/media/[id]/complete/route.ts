import { NextResponse, after } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient, createServiceRoleClient } from "@/utils/supabase/server";
import { runTranscription, startTranscription } from "@/lib/transcription-job";

async function upsertIssueForPhoto(args: {
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

  // Look for an existing issue for this aircraft+type. If found, refresh
  // last_seen_at and re-activate if it was resolved. If not found, create.
  const { data: existing, error: lookupErr } = await supabase
    .from("issues")
    .select("*")
    .eq("aircraft_id", session.aircraft_id)
    .eq("issue_type_id", type.id)
    .maybeSingle();
  if (lookupErr) return { ok: false, error: lookupErr.message };

  let issue_id: string;
  if (existing) {
    const { data: updated, error: uErr } = await supabase
      .from("issues")
      .update({
        last_seen_at: new Date().toISOString(),
        current_status: "active",
        resolved_at: null,
      })
      .eq("id", existing.id)
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

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

const completeSchema = z.object({
  file_size_bytes: z.number().int().nonnegative().optional(),
  quick_tag: z.enum(["scratch", "dent", "tire", "oil", "other"]).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const idParsed = idSchema.safeParse(id);
  if (!idParsed.success) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  let body: unknown = {};
  if (request.headers.get("content-length") !== "0") {
    try {
      body = await request.json();
    } catch {
      // empty body is fine
    }
  }
  const parsed = completeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: existing, error: loadErr } = await supabase
    .from("media_assets")
    .select("*")
    .eq("id", idParsed.data)
    .maybeSingle();
  if (loadErr) {
    return NextResponse.json({ error: loadErr.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "media not found" }, { status: 404 });
  }

  if (
    parsed.data.quick_tag !== undefined &&
    existing.media_type !== "photo"
  ) {
    return NextResponse.json(
      { error: "quick_tag is only valid for photo media" },
      { status: 400 },
    );
  }

  const update: Record<string, unknown> = { upload_status: "uploaded" };
  if (parsed.data.file_size_bytes !== undefined) {
    update.file_size_bytes = parsed.data.file_size_bytes;
  }
  if (parsed.data.quick_tag !== undefined) {
    update.quick_tag = parsed.data.quick_tag;
  }

  const { data: updated, error: updateErr } = await supabase
    .from("media_assets")
    .update(update)
    .eq("id", idParsed.data)
    .select()
    .single();
  if (updateErr || !updated) {
    return NextResponse.json(
      { error: updateErr?.message ?? "Failed to update media" },
      { status: 500 },
    );
  }

  // M3: when a photo is uploaded with a quick_tag, find-or-create the
  // corresponding issue, link the media, and append a 'logged' observation.
  // Best-effort: if any step fails, log and surface the error in the
  // response body but never fail the upload itself.
  let issue_id: string | null | undefined = updated.issue_id;
  let issue_error: string | undefined;
  const effectiveQuickTag = parsed.data.quick_tag ?? updated.quick_tag;
  if (
    updated.media_type === "photo" &&
    effectiveQuickTag &&
    !updated.issue_id
  ) {
    const issueResult = await upsertIssueForPhoto({
      supabase,
      media_asset_id: updated.id,
      preflight_session_id: updated.preflight_session_id,
      quick_tag: effectiveQuickTag,
    });
    if (issueResult.ok) {
      issue_id = issueResult.issue_id;
    } else {
      issue_error = issueResult.error;
      console.error("issue auto-create/update failed", issueResult.error);
    }
  }

  let voice_transcription_id: string | undefined;
  if (updated.media_type === "audio") {
    const start = await startTranscription({
      supabase,
      media_asset_id: updated.id,
      preflight_session_id: updated.preflight_session_id,
      storage_key: updated.storage_key,
      file_name: updated.file_name,
    });
    if (!start.ok) {
      return NextResponse.json(
        { ...updated, transcription_error: start.error },
        { status: 200 },
      );
    }
    voice_transcription_id = start.voice_transcription_id;
    if (!start.alreadyExists) {
      // Background job: cookie auth context is gone after the response is
      // sent, so the user-scoped client can't sign storage URLs or write
      // back the transcription row. Use the service-role client.
      const serviceClient = createServiceRoleClient();
      after(async () => {
        await runTranscription({
          supabase: serviceClient,
          voice_transcription_id: start.voice_transcription_id,
          preflight_session_id: updated.preflight_session_id,
          storage_key: updated.storage_key,
          file_name: updated.file_name,
        });
      });
    }
  }

  const responsePayload: Record<string, unknown> = { ...updated };
  if (issue_id !== undefined) responsePayload.issue_id = issue_id;
  if (issue_error) responsePayload.issue_error = issue_error;
  if (voice_transcription_id) {
    responsePayload.voice_transcription_id = voice_transcription_id;
  }

  return NextResponse.json(responsePayload, { status: 200 });
}
