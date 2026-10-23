"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { sendOffersAction, type ActionState } from "../../actions";
import type { SuggestedCreator } from "@/server/services/offers";
import { CreatorPhoto, tiktokUrl } from "@/components/creator-avatar";
import { CreatorFollowers } from "@/components/creator-followers";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ExternalLink } from "lucide-react";

const FIRST_SHOWN = 12;

/**
 * Label picks creators for a show: checkboxes on creator cards, grouped by
 * "in the city" then "nearby" (same state). Sends invites; creators on an
 * agency roster are answered by their agency.
 */
export function PickCreators({
  showId,
  city,
  inCity,
  nearby,
  inCityTotal,
  nearbyTotal,
  moreHref,
  ticketsLeft,
}: {
  showId: string;
  city: string;
  inCity: SuggestedCreator[];
  nearby: SuggestedCreator[];
  inCityTotal: number;
  nearbyTotal: number;
  /** Link that loads a bigger page of creators, when there are more than shown. */
  moreHref?: string | null;
  ticketsLeft: number;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(sendOffersAction, null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // Clear the picks once a send succeeds (keep them if it failed).
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state && "success" in state) setPicked(new Set());
  }

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (!inCity.length && !nearby.length) {
    return <p className="text-sm text-muted-foreground">No creators listed in or near {city} yet.</p>;
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="showId" value={showId} />
      <Group title={`In ${city}`} creators={inCity} total={inCityTotal} picked={picked} onToggle={toggle} />
      <Group title="Nearby" creators={nearby} total={nearbyTotal} picked={picked} onToggle={toggle} />
      {moreHref ? (
        <Button asChild variant="outline" size="sm">
          <Link href={moreHref} scroll={false}>
            Load more creators
          </Link>
        </Button>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <SubmitButton disabled={picked.size === 0 || picked.size > ticketsLeft} pendingLabel="Sending…">
          {picked.size ? `Invite ${picked.size} creator${picked.size === 1 ? "" : "s"}` : "Invite creators"}
        </SubmitButton>
        <p className="text-xs text-muted-foreground">
          {picked.size > ticketsLeft
            ? `Only ${ticketsLeft} ticket${ticketsLeft === 1 ? "" : "s"} left.`
            : "One ticket each. Creators with an agency are answered by their agency, and the hold goes on the agency's card."}
        </p>
      </div>
      {state && "error" in state ? (
        <p role="alert" className="text-sm font-medium text-red-400">
          {state.error}
        </p>
      ) : null}
      {state && "success" in state ? (
        <p role="status" className="text-sm font-medium text-emerald-300">
          {state.success}
        </p>
      ) : null}
    </form>
  );
}

function Group({
  title,
  creators,
  total,
  picked,
  onToggle,
}: {
  title: string;
  creators: SuggestedCreator[];
  total: number;
  picked: Set<string>;
  onToggle: (id: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  if (!creators.length) return null;
  const shown = showAll ? creators : creators.slice(0, FIRST_SHOWN);
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-semibold">
        {title} <span className="font-normal text-muted-foreground tabular-nums">({total})</span>
      </legend>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {shown.map((c) => {
          const checked = picked.has(c.id);
          return (
            <li key={c.id}>
              <label
                className={cn(
                  "relative flex h-full cursor-pointer flex-col overflow-hidden rounded-lg border transition-colors",
                  checked ? "border-primary ring-1 ring-primary" : "hover:border-primary/40",
                  c.taken && "cursor-not-allowed opacity-60",
                )}
              >
                <input
                  type="checkbox"
                  name="creatorId"
                  value={c.id}
                  checked={checked}
                  disabled={c.taken}
                  onChange={() => onToggle(c.id)}
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
                  {c.location ? (
                    <span className="block truncate text-[11px] text-muted-foreground">{c.location}</span>
                  ) : null}
                  <CreatorFollowers followers={c.followers} className="gap-x-2 text-[11px]" />
                  {c.tags.length ? (
                    <span className="block truncate text-[11px] text-muted-foreground">{c.tags.slice(0, 3).join(" · ")}</span>
                  ) : null}
                  {c.taken ? (
                    <span className="block truncate text-[11px] text-amber-300">Already invited</span>
                  ) : c.agencyName ? (
                    <span className="block truncate text-[11px] text-muted-foreground">via {c.agencyName}</span>
                  ) : null}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {creators.length > FIRST_SHOWN ? (
        <Button type="button" variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show fewer" : `Show all ${creators.length}${total > creators.length ? " loaded" : ""}`}
        </Button>
      ) : null}
    </fieldset>
  );
}
