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

/** "tiktok.com/@handle" for a creator card, or null without a handle. */
export function tiktokUrl(handle: string | null | undefined): string | null {
  return handle ? `https://www.tiktok.com/@${encodeURIComponent(handle)}` : null;
}

/**
 * Square profile photo that fills the top of a creator card. Opens their
 * TikTok in a new tab when there's a handle.
 */
export function CreatorPhoto({
  name,
  src,
  handle,
  className,
}: {
  name: string;
  src: string | null | undefined;
  handle?: string | null;
  className?: string;
}) {
  const href = tiktokUrl(handle);
  const initials =
    name
      .replace(/[^\p{L}\p{N} ]/gu, "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?";
  const photo = (
    <span className="relative block aspect-square w-full overflow-hidden bg-muted">
      {src ? (
        <Image
          src={src}
          alt=""
          fill
          sizes="(min-width: 1280px) 16vw, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
          className="object-cover transition-transform duration-200 group-hover:scale-[1.03] motion-reduce:transition-none"
        />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-2xl font-semibold text-muted-foreground" aria-hidden>
          {initials}
        </span>
      )}
    </span>
  );
  if (!href) return <span className={cn("block", className)}>{photo}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={`${name} on TikTok (opens in a new tab)`}
      className={cn("group block focus-visible:outline-2 focus-visible:outline-primary", className)}
    >
      {photo}
    </a>
  );
}
