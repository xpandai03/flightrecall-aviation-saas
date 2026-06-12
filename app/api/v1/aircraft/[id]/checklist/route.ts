import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient, createServiceRoleClient } from "@/utils/supabase/server";
import { visibleChecklist } from "@/lib/checklist";
import { isMemberOfAircraft } from "@/lib/aircraft-membership";
import { gateMediaView } from "@/lib/media-access";
import type { ChecklistImage } from "@/lib/types/database";

export const dynamic = "force-dynamic";

const BUCKET = "flight-recall-media";
const SIGNED_URL_TTL_SECONDS = 3600;
const idSchema = z.string().uuid();

const uploadUrlSchema = z.object({
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

/** Verify the aircraft exists and belongs to the authed user. */
async function ownAircraft(
  supabase: ReturnType<typeof createClient>,
  aircraftId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("aircraft")
    .select("id")
    .eq("id", aircraftId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

// GET — list the aircraft's checklist images (newest-first, capped) with
// signed view URLs.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) {
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
  // Phase 4: any MEMBER may VIEW the shared checklist (not just the owner).
  // Checklist images all belong to this route's aircraft (parsed.data), so
  // membership of that aircraft is the per-media-aircraft gate. (Management
  // POST/PATCH/DELETE stay owner-only via ownAircraft below.)
  const gate = gateMediaView(await isMemberOfAircraft(supabase, parsed.data));
  if (!gate.allow) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: rows, error } = await supabase
    .from("media_assets")
    .select("id, storage_key, file_name, created_at")
    .eq("aircraft_id", parsed.data)
    .eq("asset_role", "checklist")
    .eq("upload_status", "uploaded");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Member confirmed → mint VIEW signed URLs with the SERVICE-ROLE client
  // (bypasses user-path-scoped storage RLS so a co-pilot can view checklist
  // images another pilot uploaded). Uploads stay user-scoped (unchanged).
  const admin = createServiceRoleClient();
  const visible = visibleChecklist(rows ?? []);
  const images: ChecklistImage[] = await Promise.all(
    visible.map(async (row) => {
      const { data: signed } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(row.storage_key, SIGNED_URL_TTL_SECONDS);
      return {
        id: row.id,
        signed_url: signed?.signedUrl ?? null,
        file_name: row.file_name,
        created_at: row.created_at,
      };
    }),
  );

  return NextResponse.json({ images });
}

// POST — mint a signed upload URL + create a PENDING checklist media_asset
// for the aircraft. The client PUTs the bytes, then PATCHes [mediaId] to
// finalize (which enforces the cap). Mirrors the session upload pipeline,
// scoped to the aircraft instead of a preflight session.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = uploadUrlSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await ownAircraft(supabase, parsedId.data, user.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: assetRow, error: assetErr } = await supabase
    .from("media_assets")
    .insert({
      aircraft_id: parsedId.data,
      asset_role: "checklist",
      media_type: "photo",
      storage_key: "pending",
      file_name: parsed.data.file_name,
      mime_type: parsed.data.mime_type,
      upload_status: "pending",
      created_by: user.id, // Phase 3 attribution.
    })
    .select("id")
    .single();
  if (assetErr || !assetRow) {
    return NextResponse.json(
      { error: assetErr?.message ?? "Failed to create checklist row" },
      { status: 500 },
    );
  }

  const safeName = sanitizeFileName(parsed.data.file_name);
  // Storage path keeps the user-id segment at [2] so storage RLS
  // ((storage.foldername(name))[2] = auth.uid()) passes — same convention
  // as the session path, with `checklist` in place of `sessions/<id>`.
  const storage_key = `users/${user.id}/aircraft/${parsedId.data}/checklist/${assetRow.id}-${safeName}`;

  const { error: keyErr } = await supabase
    .from("media_assets")
    .update({ storage_key })
    .eq("id", assetRow.id);
  if (keyErr) {
    return NextResponse.json({ error: keyErr.message }, { status: 500 });
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
