import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

/**
 * Aircraft-scoped layout. Server-component check that the id in the URL
 * belongs to the authenticated user — RLS enforces, the SELECT either
 * returns one row (yours) or zero (anyone else's). Sets a
 * `last_aircraft_id` cookie so the root smart-redirect can return here
 * next time.
 */
export default async function AircraftLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  const { id } = await params;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) {
    notFound();
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data, error } = await supabase
    .from("aircraft")
    .select("id")
    .eq("id", parsed.data)
    .maybeSingle();

  if (error || !data) {
    notFound();
  }

  // Set last_aircraft_id cookie for the root smart-redirect.
  // 30-day window; httpOnly + Lax to prevent JS read + cross-site GETs.
  cookieStore.set("last_aircraft_id", parsed.data, {
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return <>{children}</>;
}
