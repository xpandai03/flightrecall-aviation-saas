import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { computeStatusColor } from "@/lib/status-color";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

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

  const { data: aircraft, error: acftErr } = await supabase
    .from("aircraft")
    .select("id")
    .eq("id", parsed.data)
    .maybeSingle();
  if (acftErr) {
    return NextResponse.json({ error: acftErr.message }, { status: 500 });
  }
  if (!aircraft) {
    return NextResponse.json({ error: "Aircraft not found" }, { status: 404 });
  }

  const { data: rows, error: rowsErr } = await supabase
    .from("issues")
    .select("id, issue_type:issue_types(severity_class)")
    .eq("aircraft_id", parsed.data)
    .eq("current_status", "active");

  if (rowsErr) {
    return NextResponse.json({ error: rowsErr.message }, { status: 500 });
  }

  const active_issue_count =
    rows?.filter(
      (r) =>
        (r.issue_type as { severity_class?: string } | null)
          ?.severity_class === "critical",
    ).length ?? 0;

  const status_color = computeStatusColor(active_issue_count);

  return NextResponse.json({ status_color, active_issue_count });
}
