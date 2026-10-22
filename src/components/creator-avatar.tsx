import Image from "next/image";
import { cn } from "@/lib/utils";

/** Small round profile photo (their TikTok picture for imported rosters), initials as fallback. */
export function CreatorAvatar({
  name,
  src,
  size = 36,
  className,
}: {
  name: string;
  src: string | null | undefined;
  size?: number;
  className?: string;
}) {
  const initials =
    name
      .replace(/[^\p{L}\p{N} ]/gu, "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?";
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-medium text-muted-foreground",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {src ? (
        <Image src={src} alt="" width={size} height={size} className="size-full object-cover" />
      ) : (
        <span aria-hidden>{initials}</span>
      )}
    </span>
  );
}
