import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  await supabase.auth.signOut();

  // Clear the last-aircraft cookie so we don't leak it across users.
  const response = NextResponse.redirect(
    `${new URL(request.url).origin}/login`,
    { status: 303 },
  );
  response.cookies.set("last_aircraft_id", "", {
    path: "/",
    maxAge: 0,
  });
  return response;
}

// Allow GET as a convenience (e.g. for direct URL hits) — same effect.
export async function GET(request: Request) {
  return POST(request);
}
