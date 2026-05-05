"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { User } from "lucide-react";

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
  const showTabs = !onOnboarding && !!currentAircraftId;
  const showPicker = !onOnboarding;

  const homeHref = currentAircraftId
    ? `/aircraft/${currentAircraftId}/dashboard`
    : "/";

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {/* Mobile: two-row layout — centered logo + absolute avatar, then
          full-width aircraft picker on its own row. Tabs live in
          <BottomNav> on mobile. */}
      <div className="sm:hidden">
        <div className="relative flex items-center justify-center px-3 pt-3 pb-2">
          <Link href={homeHref} className="flex items-center group">
            <Image
              src="/flight-recall-logo.png"
              alt="Flight Recall"
              width={120}
              height={96}
              priority
              className="h-12 w-auto"
            />
          </Link>
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <AvatarMenu userEmail={userEmail} />
          </div>
        </div>
        {showPicker && (
          <div className="px-3 pb-3 [&>button]:w-full [&>button]:max-w-sm [&>button]:mx-auto [&>button]:flex">
            <AircraftPicker aircraft={aircraft} />
          </div>
        )}
      </div>

      {/* Desktop: single horizontal row, unchanged. */}
      <div className="hidden sm:flex mx-auto h-24 max-w-6xl items-center justify-between gap-3 px-6">
        <div className="flex items-center gap-3 min-w-0">
          <Link href={homeHref} className="flex items-center group shrink-0">
            <Image
              src="/flight-recall-logo.png"
              alt="Flight Recall"
              width={120}
              height={96}
              priority
              className="h-20 w-auto"
            />
          </Link>
          {showPicker && (
            <div className="min-w-0 shrink">
              <AircraftPicker aircraft={aircraft} />
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {showTabs && (
            <DesktopTabs
              aircraftId={currentAircraftId}
              pathname={pathname}
            />
          )}
          <AvatarMenu userEmail={userEmail} />
        </div>
      </div>
    </header>
  );
}

function DesktopTabs({
  aircraftId,
  pathname,
}: {
  aircraftId: string;
  pathname: string;
}) {
  return (
    <nav className="flex items-center gap-1 mr-1">
      {NAV_PAGES.map((page) => {
        const href = `/aircraft/${aircraftId}/${page.slug}`;
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
  );
}

function AvatarMenu({ userEmail }: { userEmail: string | null }) {
  return (
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
  );
}
