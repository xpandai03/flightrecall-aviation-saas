import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceRoleClient } from "@/utils/supabase/server";
import { isMemberOfAircraft } from "@/lib/aircraft-membership";
import { gateMediaView } from "@/lib/media-access";
import {
  EXPORT_PHOTO_CAP,
  buildSessionExportModel,
  exportFilename,
} from "@/lib/session-export";
import { renderSessionPdf, type ExportPhotoData } from "@/lib/session-pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // pdf-lib needs the Node runtime, not edge.

const BUCKET = "flight-recall-media";
const SIGNED_URL_TTL_SECONDS = 300;
const idSchema = z.string().uuid();

// GET — download a session as a PDF (notes, photos, timestamp, issues).
// Gated to MEMBERS of the session's aircraft, reusing the Phase-4 pattern:
// membership check (RLS-honest, user client) → service-role signed URLs for
// the photo bytes. Never an ungated media fetch. Returned inline so iOS
// Safari opens it in its PDF viewer (Share/Save-to-Files).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Session + its issues/observations/transcripts/photos (user client → RLS
  // already requires membership to read it).
  const { data: session, error } = await supabase
    .from("preflight_sessions")
    .select(
      "*, media_assets(*), voice_transcriptions(*), issue_observations(*, issue:issues(*, issue_type:issue_types(*)))",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!session) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Explicit per-aircraft membership gate before any service-role mint.
  const gate = gateMediaView(await isMemberOfAircraft(supabase, session.aircraft_id));
  if (!gate.allow) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Aircraft tail for the header (member can read it via RLS).
  const { data: aircraft } = await supabase
    .from("aircraft")
    .select("tail_number")
    .eq("id", session.aircraft_id)
    .maybeSingle();
  const tail = aircraft?.tail_number ?? "Aircraft";

  const nowIso = new Date().toISOString();
  const model = buildSessionExportModel(
    {
      tail,
      created_at: session.created_at,
      status_color: session.status_color,
      notes_text: session.notes_text,
      issue_observations: session.issue_observations,
      voice_transcriptions: session.voice_transcriptions,
      media_assets: session.media_assets,
    },
    nowIso,
  );

  // Fetch photo bytes via the Phase-4 authorized path: service-role signed
  // URL (AFTER the membership gate above) → server-side fetch. Capped so a
  // huge session can't time out.
  const admin = createServiceRoleClient();
  const photoData: ExportPhotoData[] = [];
  for (const photo of model.photos.slice(0, EXPORT_PHOTO_CAP)) {
    try {
      const { data: signed } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(photo.storage_key, SIGNED_URL_TTL_SECONDS);
      if (!signed?.signedUrl) continue;
      const res = await fetch(signed.signedUrl);
      if (!res.ok) continue;
      photoData.push({
        bytes: new Uint8Array(await res.arrayBuffer()),
        mime_type: photo.mime_type,
      });
    } catch {
      // Best-effort: a photo that won't fetch is skipped, PDF still renders.
    }
  }

  let pdf: Uint8Array;
  try {
    pdf = await renderSessionPdf(model, photoData);
  } catch (err) {
    console.error("[session export] PDF render failed", {
      session_id: id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 });
  }

  return new Response(pdf as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      // Inline → iOS Safari opens its PDF viewer (Share/Save-to-Files);
      // desktop previews with a download option. Filename still suggested.
      "Content-Disposition": `inline; filename="${exportFilename(tail, session.created_at)}"`,
      "Cache-Control": "no-store",
    },
  });
}
