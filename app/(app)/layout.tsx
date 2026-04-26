import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { TopNav } from "@/components/top-nav";
import { createClient } from "@/utils/supabase/server";
import type { Aircraft } from "@/lib/types/database";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Defensive — middleware should already have redirected.
    redirect("/login");
  }

  const { data } = await supabase
    .from("aircraft")
    .select("*")
    .order("tail_number", { ascending: true });
  const aircraft: Aircraft[] = data ?? [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-sky-50/40">
      <TopNav
        aircraft={aircraft}
        userEmail={user.email ?? null}
      />
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8 sm:py-12">
        {children}
      </main>
    </div>
  );
}
