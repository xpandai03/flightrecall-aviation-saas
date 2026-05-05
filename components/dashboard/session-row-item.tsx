import Link from "next/link";
import {
  Camera,
  CheckCircle2,
  ChevronRight,
  Mic,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  StatusPill,
  type StatusPillVariant,
} from "@/components/dashboard/status-pill";

type MediaType = "voice" | "photo" | "mixed" | "none";
type RowStatus = "critical" | "warning" | "all_clear";

interface SessionRowItemProps {
  summary: string;
  mediaType: MediaType;
  timeAgo: string;
  status: RowStatus;
  href: string;
  className?: string;
}

const MEDIA_ICON: Record<MediaType, LucideIcon> = {
  voice: Mic,
  photo: Camera,
  mixed: Camera,
  none: CheckCircle2,
};

function mapStatusToPill(status: RowStatus): StatusPillVariant {
  if (status === "critical") return "needs_attention";
  if (status === "warning") return "monitor";
  return "all_clear";
}

export function SessionRowItem({
  summary,
  mediaType,
  timeAgo,
  status,
  href,
  className,
}: SessionRowItemProps) {
  const Icon = MEDIA_ICON[mediaType];
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-3 rounded-2xl bg-bg-card-glass border border-border-subtle px-4 py-3 shadow-card-glow transition-colors hover:border-accent-teal/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-teal",
        className,
      )}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-mint/10 text-accent-mint">
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-text-primary truncate">
          {summary}
        </div>
        <div className="text-xs text-text-muted mt-0.5">{timeAgo}</div>
      </div>
      <StatusPill variant={mapStatusToPill(status)} />
      <ChevronRight
        className="size-4 text-text-muted transition-transform group-hover:translate-x-0.5"
        aria-hidden
      />
    </Link>
  );
}
