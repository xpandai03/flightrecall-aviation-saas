import { TopNav } from "@/components/top-nav"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-sky-50/40">
      <TopNav />
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8 sm:py-12">{children}</main>
    </div>
  )
}
