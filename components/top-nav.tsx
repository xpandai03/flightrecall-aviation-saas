"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Plane } from "lucide-react"
import { cn } from "@/lib/utils"

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/sessions", label: "Sessions" },
  { href: "/memory", label: "Memory" },
]

export function TopNav() {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 group">
          <span className="flex size-7 items-center justify-center rounded-md bg-gradient-to-br from-sky-400 to-cyan-500 text-white shadow-sm">
            <Plane className="size-3.5 -rotate-45" />
          </span>
          <span className="text-sm font-semibold tracking-tight">Flight Memory</span>
        </Link>

        <nav className="flex items-center gap-1">
          {LINKS.map((link) => {
            const active =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href)
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "relative rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {link.label}
                {active && (
                  <span className="absolute inset-x-3 -bottom-[9px] h-[2px] rounded-full bg-foreground" />
                )}
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
