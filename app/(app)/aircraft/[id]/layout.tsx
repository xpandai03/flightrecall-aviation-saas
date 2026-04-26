import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

/**
 * Aircraft-scoped layout. Server-component check that the id in the URL
 * belongs to the authenticated user — RLS enforces, the SELECT either
 * returns one row (yours) or zero (anyone else's).
 *
 * Note: the `last_aircraft_id` cookie that powers the root smart-redirect
 * is written in middleware (utils/supabase/middleware.ts updateSession),
 * NOT here. Server Components can't write cookies in Next 15+ — only
 * middleware, Route Handlers, and Server Actions can.
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

  return <>{children}</>;
}
