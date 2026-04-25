"use client"

import { TopNav } from "@/components/top-nav"
import { SessionsProvider } from "@/lib/mock-data"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionsProvider>
      <div className="min-h-screen bg-gradient-to-b from-background via-background to-sky-50/40">
        <TopNav />
        <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8 sm:py-12">{children}</main>
      </div>
    </SessionsProvider>
  )
}
