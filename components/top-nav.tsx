"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { Plane, User } from "lucide-react";

import { cn } from "@/lib/utils";
import { AircraftPicker } from "@/components/aircraft/aircraft-picker";
import { SignOutButton } from "@/components/auth/sign-out-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Aircraft } from "@/lib/types/database";

const NAV_PAGES = [
  { slug: "dashboard", label: "Dashboard" },
  { slug: "sessions", label: "Sessions" },
  { slug: "memory", label: "Memory" },
] as const;

export function TopNav({
  aircraft,
  userEmail,
}: {
  aircraft: Aircraft[];
  userEmail: string | null;
}) {
  const pathname = usePathname();
  const params = useParams<{ id?: string }>();
  const currentAircraftId = params.id ?? null;

  // Onboarding hides the picker (no aircraft yet OR no aircraft context).
  const onOnboarding = pathname.startsWith("/onboarding");

  const homeHref = currentAircraftId
    ? `/aircraft/${currentAircraftId}/dashboard`
    : "/";

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex items-center gap-3 min-w-0">
          <Link href={homeHref} className="flex items-center gap-2 group shrink-0">
            <span className="flex size-7 items-center justify-center rounded-md bg-gradient-to-br from-sky-400 to-cyan-500 text-white shadow-sm">
              <Plane className="size-3.5 -rotate-45" />
            </span>
            <span className="text-sm font-semibold tracking-tight">
              Flight Recall
            </span>
          </Link>
          {!onOnboarding && <AircraftPicker aircraft={aircraft} />}
        </div>

        <div className="flex items-center gap-1">
          {!onOnboarding && currentAircraftId && (
            <nav className="flex items-center gap-1 mr-1">
              {NAV_PAGES.map((page) => {
                const href = `/aircraft/${currentAircraftId}/${page.slug}`;
                const active = pathname === href;
                return (
                  <Link
                    key={page.slug}
                    href={href}
                    className={cn(
                      "relative rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
                      active
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {page.label}
                    {active && (
                      <span className="absolute inset-x-2.5 -bottom-[9px] h-[2px] rounded-full bg-foreground" />
                    )}
                  </Link>
                );
              })}
            </nav>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex size-8 items-center justify-center rounded-full border border-border bg-background hover:bg-accent transition-colors"
                aria-label="Account menu"
              >
                <User className="size-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {userEmail && (
                <>
                  <DropdownMenuLabel className="text-xs font-normal text-muted-foreground truncate">
                    {userEmail}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                </>
              )}
              <SignOutButton />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
