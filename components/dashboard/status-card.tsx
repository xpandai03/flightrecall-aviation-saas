import Link from "next/link";
import { AlertTriangle, CheckCircle2, Plane } from "lucide-react";

import { cn } from "@/lib/utils";

type StatusCardMode = "has_issues" | "all_clear" | "first_session";

interface StatusCardProps {
  tailNumber: string;
  aircraftModel: string | null;
  activeIssueCount: number | null;
  subline?: string;
  mode: StatusCardMode;
  ctaHref: string;
  ctaLabel?: string;
  className?: string;
}

export function StatusCard({
  tailNumber,
  aircraftModel,
  activeIssueCount,
  subline,
  mode,
  ctaHref,
  ctaLabel = "Start Preflight",
  className,
}: StatusCardProps) {
  const headerLabel = aircraftModel
    ? `${tailNumber} — ${aircraftModel}`
    : tailNumber;

  return (
    <section
      className={cn(
        "rounded-2xl bg-bg-card border border-border-subtle p-6 shadow-card-glow",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-text-secondary text-xs font-medium tracking-wide uppercase">
        <Plane className="size-3.5 -rotate-45" aria-hidden />
        <span className="truncate">{headerLabel}</span>
      </div>

      <div className="mt-4 flex flex-col gap-1.5">
        {mode === "has_issues" && (
          <>
            <div className="flex items-center gap-2">
              <AlertTriangle
                className={cn(
                  "size-5 shrink-0",
                  (activeIssueCount ?? 0) >= 3
                    ? "text-status-critical"
                    : "text-status-warning",
                )}
                aria-hidden
              />
              <h1 className="text-lg sm:text-xl font-semibold tracking-wide text-text-primary uppercase">
                {activeIssueCount} {activeIssueCount === 1 ? "Active Issue" : "Active Issues"}
              </h1>
            </div>
            {subline && (
              <p className="text-sm text-text-secondary">{subline}</p>
            )}
          </>
        )}

        {mode === "all_clear" && (
          <>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-5 shrink-0 text-status-clear" aria-hidden />
              <h1 className="text-lg sm:text-xl font-semibold tracking-wide text-text-primary">
                All clear
              </h1>
            </div>
            {subline && (
              <p className="text-sm text-text-secondary">{subline}</p>
            )}
          </>
        )}

        {mode === "first_session" && (
          <>
            <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-text-primary">
              Welcome — no flights logged yet.
            </h1>
            <p className="text-sm text-text-secondary">
              Start your first preflight to begin building memory.
            </p>
          </>
        )}
      </div>

      <Link
        href={ctaHref}
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full h-12 bg-accent-mint text-primary-foreground text-sm font-semibold tracking-wide transition-colors hover:bg-accent-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-teal focus-visible:ring-offset-2 focus-visible:ring-offset-bg-card sm:w-auto sm:px-10"
      >
        <Plane className="size-4 -rotate-45" aria-hidden />
        {ctaLabel}
      </Link>
      <p className="mt-2 text-xs text-text-muted">Voice + photo. No typing.</p>
    </section>
  );
}
