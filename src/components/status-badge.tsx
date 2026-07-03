import { cn } from "@/lib/utils";

type Tone = "neutral" | "info" | "success" | "warning" | "danger";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground border-transparent",
  info: "bg-sky-500/15 text-sky-300 border-sky-500/25",
  success: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
  warning: "bg-amber-500/15 text-amber-300 border-amber-500/25",
  danger: "bg-red-500/15 text-red-300 border-red-500/25",
};

/**
 * Screen-reader-friendly status chip: renders as text with role="status"
 * semantics via a visible label (no color-only meaning).
 */
export function StatusBadge({
  label,
  tone,
  className,
}: {
  label: string;
  tone: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {label}
    </span>
  );
}
