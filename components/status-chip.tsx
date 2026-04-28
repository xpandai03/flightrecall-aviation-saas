import { Plane } from "lucide-react";
import type { StatusColor } from "@/lib/types/database";

type Size = "sm" | "lg";

const COLOR_CLASSES: Record<"green" | "yellow" | "red" | "unknown", string> = {
  green: "border-emerald-200/70 bg-emerald-50/70 text-emerald-700",
  yellow: "border-amber-200/70 bg-amber-50/70 text-amber-700",
  red: "border-rose-200/70 bg-rose-50/70 text-rose-700",
  unknown: "border-sky-200/70 bg-sky-50/70 text-sky-700",
};

export function StatusChip({
  color,
  label,
  size = "sm",
}: {
  color: StatusColor | null;
  label: string;
  size?: Size;
}) {
  const colorCls = COLOR_CLASSES[color ?? "unknown"];
  if (size === "lg") {
    return (
      <span
        className={`inline-flex items-center gap-2 rounded-full border ${colorCls} px-4 py-1.5 text-sm font-medium`}
      >
        <Plane className="size-3.5 -rotate-45" />
        {label}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center rounded-full border ${colorCls} px-2.5 py-0.5 text-xs font-medium`}
    >
      {label}
    </span>
  );
}
