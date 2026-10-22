import { compactCount } from "@/lib/roster";
import { cn } from "@/lib/utils";

type Platform = "tiktok" | "instagram" | "youtube";

const LABELS: Record<Platform, string> = { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube" };

function PlatformIcon({ platform }: { platform: Platform }) {
  const common = { className: "size-3", viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": true } as const;
  if (platform === "tiktok") {
    return (
      <svg {...common}>
        <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 1 1-2.59-2.59c.27 0 .53.04.77.12V9.77a5.69 5.69 0 1 0 4.91 5.63V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3a4.3 4.3 0 0 1-3.24-1.48Z" />
      </svg>
    );
  }
  if (platform === "instagram") {
    return (
      <svg {...common} fill="none" stroke="currentColor" strokeWidth={2}>
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M21.6 7.2a2.5 2.5 0 0 0-1.76-1.77C18.27 5 12 5 12 5s-6.27 0-7.84.43A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.76 1.77C5.73 19 12 19 12 19s6.27 0 7.84-.43a2.5 2.5 0 0 0 1.76-1.77A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8ZM10 15V9l5.2 3L10 15Z" />
    </svg>
  );
}

/** "TikTok 4.3M · Instagram 951.7K" as tiny icons + counts; platforms with 0 are skipped. */
export function CreatorFollowers({
  followers,
  className,
}: {
  followers: { tiktok: number; instagram: number; youtube: number };
  className?: string;
}) {
  const entries = (Object.keys(LABELS) as Platform[]).filter((p) => followers[p] > 0);
  if (!entries.length) return null;
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground", className)}>
      {entries.map((p) => (
        <li key={p} className="inline-flex items-center gap-1 tabular-nums">
          <PlatformIcon platform={p} />
          <span className="sr-only">{LABELS[p]}</span>
          {compactCount(followers[p])}
        </li>
      ))}
    </ul>
  );
}
