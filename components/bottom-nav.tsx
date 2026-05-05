"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import {
  BookOpen,
  History,
  LayoutDashboard,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

type TabSlug = "dashboard" | "sessions" | "memory";

const TABS: { slug: TabSlug; label: string; Icon: LucideIcon }[] = [
  { slug: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { slug: "sessions", label: "Sessions", Icon: History },
  { slug: "memory", label: "Memory", Icon: BookOpen },
];

/**
 * Mobile-only fixed primary navigation. Mirrors the visibility rules of
 * the desktop tabs in <TopNav> — hidden on onboarding and when there's no
 * aircraft scoping in the URL.
 *
 * Active-tab style mirrors <TopNav>'s desktop active state but inverted:
 * a 2px mint bar at the top edge (since the bar sits at the bottom of
 * the viewport) plus mint icon + label.
 */
export function BottomNav() {
  const pathname = usePathname();
  const params = useParams<{ id?: string }>();
  const aircraftId = params.id;

  if (pathname.startsWith("/onboarding")) return null;
  if (!aircraftId) return null;

  return (
    <nav
      aria-label="Primary"
      className="sm:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border-subtle bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70 pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="flex items-stretch justify-around">
        {TABS.map(({ slug, label, Icon }) => {
          const href = `/aircraft/${aircraftId}/${slug}`;
          const active = pathname === href;
          return (
            <li key={slug} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-1 py-2.5",
                  active
                    ? "text-accent-mint"
                    : "text-text-muted hover:text-text-secondary",
                )}
              >
                {active && (
                  <span
                    aria-hidden
                    className="absolute top-0 left-1/4 right-1/4 h-[2px] rounded-full bg-accent-mint"
                  />
                )}
                <Icon className="size-5" aria-hidden />
                <span className="text-[11px] font-medium">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
