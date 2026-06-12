import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

const uuid = z.string().uuid();
const MAX_IDS = 100;

// GET /api/v1/profiles?ids=a,b,c — resolve creator ids → first names for
// "logged by {pilot}". RLS (profiles_select_self_or_comember) returns only
// the caller's own profile and those of co-members; ids the caller may not
// see simply don't come back (the UI falls back to a neutral label). No
// email is ever returned.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ids = Array.from(
    new Set(
      (searchParams.get("ids") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter((s) => uuid.safeParse(s).success),
    ),
  ).slice(0, MAX_IDS);

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (ids.length === 0) {
    return NextResponse.json({ profiles: [] });
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, first_name")
    .in("user_id", ids);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ profiles: data ?? [] });
}
