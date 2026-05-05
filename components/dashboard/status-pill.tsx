import { cn } from "@/lib/utils";

export type StatusPillVariant =
  | "needs_attention"
  | "monitor"
  | "all_clear"
  | "resolved";

interface StatusPillProps {
  variant: StatusPillVariant;
  label?: string;
  className?: string;
}

const DEFAULT_LABEL: Record<StatusPillVariant, string> = {
  needs_attention: "Needs Attention",
  monitor: "Monitor",
  all_clear: "All Clear",
  resolved: "Resolved",
};

const VARIANT_CLASSES: Record<StatusPillVariant, string> = {
  needs_attention:
    "bg-status-critical/15 text-status-critical ring-1 ring-status-critical/30",
  monitor:
    "bg-status-warning/15 text-status-warning ring-1 ring-status-warning/30",
  all_clear:
    "bg-status-clear/15 text-status-clear ring-1 ring-status-clear/30",
  resolved:
    "bg-accent-teal/10 text-accent-teal ring-1 ring-accent-teal/25",
};

export function StatusPill({ variant, label, className }: StatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium tracking-wide whitespace-nowrap",
        VARIANT_CLASSES[variant],
        className,
      )}
    >
      {label ?? DEFAULT_LABEL[variant]}
    </span>
  );
}
