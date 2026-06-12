import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient, createServiceRoleClient } from "@/utils/supabase/server";
import { isMemberOfAircraft } from "@/lib/aircraft-membership";
import { gateMediaView } from "@/lib/media-access";
import type { MediaAsset } from "@/lib/types/database";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

const BUCKET = "flight-recall-media";
const SIGNED_URL_TTL_SECONDS = 3600;

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

  const { data, error } = await supabase
    .from("preflight_sessions")
    .select(
      "*, media_assets(*), voice_transcriptions(*), issue_observations(*, issue:issues(*, issue_type:issue_types(*)))",
    )
    .eq("id", parsed.data)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Phase 4: this session's media belong to data.aircraft_id. The
  // user-client read above already required membership (RLS
  // sessions_select_member), but we verify it EXPLICITLY against the
  // media's own aircraft before any service-role mint — the membership
  // check is the only thing gating the RLS-bypassing service-role client.
  const gate = gateMediaView(
    await isMemberOfAircraft(supabase, data.aircraft_id),
  );
  if (!gate.allow) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Member confirmed → mint VIEW signed URLs with the SERVICE-ROLE client
  // (bypasses the user-path-scoped storage RLS so a co-pilot can view
  // another pilot's media). Uploads remain user-scoped (unchanged).
  const admin = createServiceRoleClient();
  const rawAssets: MediaAsset[] = data.media_assets ?? [];
  const media_assets = await Promise.all(
    rawAssets.map(async (asset) => {
      const { data: signed, error: signedErr } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(asset.storage_key, SIGNED_URL_TTL_SECONDS);
      if (signedErr || !signed?.signedUrl) {
        console.error("signed URL mint failed", {
          asset_id: asset.id,
          storage_key: asset.storage_key,
          error: signedErr?.message,
        });
        return { ...asset, signed_url: null };
      }
      return { ...asset, signed_url: signed.signedUrl };
    }),
  );

  return NextResponse.json({ ...data, media_assets });
}
