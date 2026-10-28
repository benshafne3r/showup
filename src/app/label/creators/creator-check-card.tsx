"use client";

import type { SuggestedCreator } from "@/server/services/offers";
import { CreatorPhoto, tiktokUrl } from "@/components/creator-avatar";
import { CreatorFollowers } from "@/components/creator-followers";
import { cn } from "@/lib/utils";
import { ExternalLink } from "lucide-react";

/**
 * A creator card with a checkbox (photo first; photo and @handle open their
 * TikTok). Used by the Creators tab and a show's "Pick creators".
 */
export function CreatorCheckCard({
  creator: c,
  checked,
  onToggle,
  disabled = false,
  note,
}: {
  creator: SuggestedCreator;
  checked: boolean;
  onToggle: () => void;
  /** Already invited to the chosen show. */
  disabled?: boolean;
  /** Overrides the "via <agency>" line, e.g. "Already invited". */
  note?: string | null;
}) {
  return (
    <label
      className={cn(
        "relative flex h-full cursor-pointer flex-col overflow-hidden rounded-lg border transition-colors",
        checked ? "border-primary ring-1 ring-primary" : "hover:border-primary/40",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <input
        type="checkbox"
        name="creatorId"
        value={c.id}
        checked={checked}
        disabled={disabled}
        onChange={onToggle}
        className="absolute top-2 left-2 z-10 size-4 accent-primary"
        aria-label={`Invite ${c.name}`}
      />
      <CreatorPhoto name={c.name} src={c.avatarUrl} handle={c.handle} />
      <span className={cn("min-w-0 flex-1 space-y-0.5 p-2", checked && "bg-primary/10")}>
        <span className="block truncate text-sm leading-tight font-medium">{c.name}</span>
        {c.handle ? (
          <a
            href={tiktokUrl(c.handle)!}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 truncate text-[11px] text-muted-foreground hover:text-foreground"
          >
            <span className="truncate">@{c.handle}</span>
            <ExternalLink className="size-3 shrink-0" aria-hidden />
          </a>
        ) : null}
        {c.location ? <span className="block truncate text-[11px] text-muted-foreground">{c.location}</span> : null}
        <CreatorFollowers followers={c.followers} className="gap-x-2 text-[11px]" />
        {c.tags.length ? (
          <span className="block truncate text-[11px] text-muted-foreground">{c.tags.slice(0, 3).join(" · ")}</span>
        ) : null}
        {note ? (
          <span className="block truncate text-[11px] text-amber-300">{note}</span>
        ) : c.agencyName ? (
          <span className="block truncate text-[11px] text-muted-foreground">via {c.agencyName}</span>
        ) : null}
      </span>
    </label>
  );
}
