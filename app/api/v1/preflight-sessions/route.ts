import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { computeStatusColor } from "@/lib/status-color";

export const dynamic = "force-dynamic";

const createSessionSchema = z.object({
  aircraft_id: z.string().uuid(),
  input_type: z.enum(["photo", "voice", "no_issues"]),
  status_color: z.enum(["green", "yellow", "red"]).optional(),
  notes_text: z.string().optional(),
  transcript_text: z.string().optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createSessionSchema.safeParse(body);
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

  // M3: snapshot the aircraft's status_color into the session row at
  // creation time. For voice/photo we override any client-supplied value
  // with the live algorithmic count. For no_issues we keep the
  // declarative 'green' regardless of count (locked V1 decision; see
  // m3 plan §10 Q5).
  let computed_status_color = parsed.data.status_color ?? null;
  if (parsed.data.input_type === "no_issues") {
    computed_status_color = "green";
  } else {
    const { count, error: countErr } = await supabase
      .from("issues")
      .select("*", { count: "exact", head: true })
      .eq("aircraft_id", parsed.data.aircraft_id)
      .eq("current_status", "active");
    if (!countErr) {
      computed_status_color = computeStatusColor(count ?? 0);
    } else {
      // Don't fail session creation on a status-color compute hiccup.
      console.error("status_color compute failed", countErr);
    }
  }

  const insertPayload = {
    ...parsed.data,
    status_color: computed_status_color,
  };

  const { data, error } = await supabase
    .from("preflight_sessions")
    .insert(insertPayload)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}

const listQuerySchema = z.object({
  aircraftId: z.string().uuid().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = listQuerySchema.safeParse({
    aircraftId: url.searchParams.get("aircraftId") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { aircraftId, limit = 50 } = parsed.data;

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let q = supabase
    .from("preflight_sessions")
    .select(
      "*, media_assets(*), voice_transcriptions(*), issue_observations(*, issue:issues(*, issue_type:issue_types(*)))",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (aircraftId) {
    q = q.eq("aircraft_id", aircraftId);
  }

  const { data, error } = await q;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}
