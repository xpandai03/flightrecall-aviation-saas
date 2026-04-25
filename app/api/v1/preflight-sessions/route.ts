import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";

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

  const { data, error } = await supabase
    .from("preflight_sessions")
    .insert(parsed.data)
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

  let q = supabase
    .from("preflight_sessions")
    .select("*, media_assets(*)")
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
