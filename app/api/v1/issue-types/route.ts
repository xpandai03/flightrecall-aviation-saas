import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Reference data: full issue_types taxonomy ordered by category then
 * name. Used by the Confirmation screen's per-issue type dropdown.
 *
 * RLS: issue_types_read_all_authed (m4_lockdown:268) makes this
 * readable to any authenticated user — global reference data with no
 * per-user scoping.
 */
export async function GET() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("issue_types")
    .select("*")
    .order("category", { nullsFirst: false })
    .order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
