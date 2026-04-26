import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

const createAircraftSchema = z.object({
  tail_number: z.string().min(1).max(20),
  aircraft_type: z.string().max(80).optional(),
});

async function requireUser() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET() {
  const { supabase, user } = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data, error } = await supabase
    .from("aircraft")
    .select("*")
    .order("tail_number", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}

export async function POST(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = createAircraftSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const insertPayload = {
    user_id: user.id,
    tail_number: parsed.data.tail_number,
    aircraft_type: parsed.data.aircraft_type ?? null,
  };

  const { data, error } = await supabase
    .from("aircraft")
    .insert(insertPayload)
    .select()
    .single();
  if (error) {
    // Handle the unique tail_number violation with a friendly 409.
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "An aircraft with that tail number already exists." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
