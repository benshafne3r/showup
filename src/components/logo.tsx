import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";

/**
 * ShowUp wordmark: a flat red ticket mark + a solid wordmark. No gradients —
 * a single accent color reads as a real brand, not an AI mockup.
 */
export function Logo({
  className,
  markClassName,
  wordmark = true,
}: {
  className?: string;
  markClassName?: string;
  wordmark?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <TicketMark className={markClassName} />
      {wordmark ? (
        <span className="text-lg font-bold tracking-tight text-foreground">ShowUp</span>
      ) : (
        <span className="sr-only">{BRAND.name}</span>
      )}
    </span>
  );
}

function TicketMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("size-6 text-primary", className)}
      fill="none"
      aria-hidden
    >
      {/* Ticket body with a perforation notch on each vertical edge. */}
      <path
        d="M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5V9a1.75 1.75 0 0 0 0 6v2.5A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5V15a1.75 1.75 0 0 0 0-6V6.5Z"
        fill="currentColor"
      />
      {/* Dashed stub line. */}
      <path
        d="M14.5 6.5v11"
        stroke="var(--background)"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeDasharray="1 2.2"
      />
    </svg>
  );
}
