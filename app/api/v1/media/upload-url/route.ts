import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

const BUCKET = "flight-recall-media";

const uploadUrlSchema = z.object({
  preflight_session_id: z.string().uuid(),
  media_type: z.enum(["photo", "audio"]),
  file_name: z.string().min(1).max(512),
  mime_type: z.string().min(1).max(128),
});

function sanitizeFileName(input: string): string {
  const dotIdx = input.lastIndexOf(".");
  const stem = dotIdx > 0 ? input.slice(0, dotIdx) : input;
  const ext = dotIdx > 0 ? input.slice(dotIdx + 1) : "";
  const cleanStem = stem.replace(/[^a-zA-Z0-9._-]/g, "_");
  const cleanExt = ext.toLowerCase().replace(/[^a-z0-9]/g, "");
  return cleanExt ? `${cleanStem}.${cleanExt}` : cleanStem;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = uploadUrlSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { preflight_session_id, media_type, file_name, mime_type } = parsed.data;

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // M4: require auth + scope storage path by user.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: sessionRow, error: sessionErr } = await supabase
    .from("preflight_sessions")
    .select("id, aircraft_id")
    .eq("id", preflight_session_id)
    .maybeSingle();
  if (sessionErr) {
    return NextResponse.json({ error: sessionErr.message }, { status: 500 });
  }
  if (!sessionRow) {
    return NextResponse.json(
      { error: "preflight_session_id not found" },
      { status: 404 },
    );
  }

  const { data: assetRow, error: assetErr } = await supabase
    .from("media_assets")
    .insert({
      preflight_session_id,
      media_type,
      storage_key: "pending",
      file_name,
      mime_type,
      upload_status: "pending",
    })
    .select()
    .single();
  if (assetErr || !assetRow) {
    return NextResponse.json(
      { error: assetErr?.message ?? "Failed to create media row" },
      { status: 500 },
    );
  }

  const safeName = sanitizeFileName(file_name);
  // M4 storage path convention — user/aircraft scoped. Storage RLS
  // enforces that (storage.foldername(name))[2] = auth.uid()::text.
  const storage_key = `users/${user.id}/aircraft/${sessionRow.aircraft_id}/sessions/${preflight_session_id}/${media_type}/${assetRow.id}-${safeName}`;

  const { error: keyUpdateErr } = await supabase
    .from("media_assets")
    .update({ storage_key })
    .eq("id", assetRow.id);
  if (keyUpdateErr) {
    return NextResponse.json({ error: keyUpdateErr.message }, { status: 500 });
  }

  const { data: signed, error: signedErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(storage_key);
  if (signedErr || !signed) {
    return NextResponse.json(
      { error: signedErr?.message ?? "Failed to mint signed upload URL" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      media_asset_id: assetRow.id,
      signed_url: signed.signedUrl,
      token: signed.token,
      storage_key,
    },
    { status: 201 },
  );
}
