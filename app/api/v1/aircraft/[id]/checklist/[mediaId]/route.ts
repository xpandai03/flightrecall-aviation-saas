import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { selectChecklistEvictions } from "@/lib/checklist";

export const dynamic = "force-dynamic";

const BUCKET = "flight-recall-media";
const idSchema = z.string().uuid();

/**
 * Resolve the checklist media row IF it belongs to the authed user's
 * aircraft. Returns null otherwise (→ 404, no existence leak). RLS also
 * enforces this; the explicit check gives clean status codes.
 */
async function ownChecklistAsset(
  supabase: ReturnType<typeof createClient>,
  aircraftId: string,
  mediaId: string,
  userId: string,
): Promise<{ id: string; storage_key: string } | null> {
  const { data: aircraft } = await supabase
    .from("aircraft")
    .select("id")
    .eq("id", aircraftId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!aircraft) return null;

  const { data: row } = await supabase
    .from("media_assets")
    .select("id, storage_key")
    .eq("id", mediaId)
    .eq("aircraft_id", aircraftId)
    .eq("asset_role", "checklist")
    .maybeSingle();
  return row ?? null;
}

// PATCH — finalize a checklist upload: mark uploaded, then enforce the
// cap by evicting the oldest images beyond it (replace-semantics).
export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string; mediaId: string }> },
) {
  const { id, mediaId } = await params;
  if (!idSchema.safeParse(id).success || !idSchema.safeParse(mediaId).success) {
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
  const owned = await ownChecklistAsset(supabase, id, mediaId, user.id);
  if (!owned) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { error: updErr } = await supabase
    .from("media_assets")
    .update({ upload_status: "uploaded" })
    .eq("id", mediaId);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  // Enforce the cap: keep the newest CHECKLIST_CAP, evict older ones
  // (row + storage object). Checklist images are not referenced by any
  // issue/session, so a hard delete is safe (no orphaning of in-use data).
  const { data: uploaded, error: listErr } = await supabase
    .from("media_assets")
    .select("id, storage_key, created_at")
    .eq("aircraft_id", id)
    .eq("asset_role", "checklist")
    .eq("upload_status", "uploaded");
  if (listErr) {
    return NextResponse.json({ error: listErr.message }, { status: 500 });
  }

  const evictIds = selectChecklistEvictions(uploaded ?? []);
  if (evictIds.length > 0) {
    const evictRows = (uploaded ?? []).filter((r) => evictIds.includes(r.id));
    const keys = evictRows.map((r) => r.storage_key).filter(Boolean);
    if (keys.length > 0) {
      const { error: rmErr } = await supabase.storage.from(BUCKET).remove(keys);
      if (rmErr) {
        // Non-fatal: the row delete below still drops the reference; a
        // stray storage object is harmless and reclaimable later.
        console.error("checklist evict storage remove failed", rmErr.message);
      }
    }
    const { error: delErr } = await supabase
      .from("media_assets")
      .delete()
      .in("id", evictIds);
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ id: mediaId, evicted: evictIds }, { status: 200 });
}

// DELETE — remove a single checklist image (row + storage object).
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; mediaId: string }> },
) {
  const { id, mediaId } = await params;
  if (!idSchema.safeParse(id).success || !idSchema.safeParse(mediaId).success) {
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
  const owned = await ownChecklistAsset(supabase, id, mediaId, user.id);
  if (!owned) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (owned.storage_key && owned.storage_key !== "pending") {
    const { error: rmErr } = await supabase.storage
      .from(BUCKET)
      .remove([owned.storage_key]);
    if (rmErr) {
      console.error("checklist delete storage remove failed", rmErr.message);
    }
  }
  const { error: delErr } = await supabase
    .from("media_assets")
    .delete()
    .eq("id", mediaId);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  return NextResponse.json({ id: mediaId }, { status: 200 });
}
