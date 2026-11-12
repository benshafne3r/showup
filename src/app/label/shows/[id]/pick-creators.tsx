"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { sendOffersAction, type ActionState } from "../../actions";
import type { SuggestedCreator } from "@/server/services/offers";
import { CreatorCheckCard } from "../../creators/creator-check-card";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronDown, Send, Users, X } from "lucide-react";

const FIRST_SHOWN = 12;

/**
 * Label picks creators for a show: checkboxes on creator cards, grouped by
 * "in the city" then "nearby" (same state, folded away until opened). Picking
 * anyone brings up a floating bar to send the invites, which go out in the
 * background (see queueOffers), so the label can leave the page right away.
 * Invites don't hold tickets: the first creators to accept get them.
 * Creators on an agency roster are answered by their agency.
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
  title,
  emptyText,
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
  /** Heading for the first group instead of "In <city>" (e.g. "All creators"). */
  title?: string;
  /** Shown when there are no creators to list. */
  emptyText?: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(sendOffersAction, null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // Invites queued from this page: those cards lock until the page reloads.
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<ActionState>(null);
  // On a successful send: lock the sent cards and clear the picks (keep them if it failed).
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    setNotice(state);
    if (state && "success" in state) {
      setSent((prev) => new Set([...prev, ...picked]));
      setPicked(new Set());
    }
  }

  const toggle = (id: string) => {
    setNotice(null);
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!inCity.length && !nearby.length) {
    return <p className="text-sm text-muted-foreground">{emptyText ?? `No creators listed in or near ${city} yet.`}</p>;
  }

  // Invites don't hold tickets (the first to accept get them), so the label
  // can invite more creators than it has tickets, as long as one is left.
  const soldOut = ticketsLeft <= 0;
  const overInvited = picked.size > ticketsLeft;
  const showBar = picked.size > 0 || notice !== null;

  return (
    <form action={formAction} className={cn("space-y-5", showBar && "pb-24")}>
      <input type="hidden" name="showId" value={showId} />
      {[...picked].map((id) => (
        <input key={id} type="hidden" name="creatorId" value={id} />
      ))}
      <Group title={title ?? `In ${city}`} creators={inCity} total={inCityTotal} picked={picked} sent={sent} onToggle={toggle} />
      <Group title="Nearby" creators={nearby} total={nearbyTotal} picked={picked} sent={sent} onToggle={toggle} folded />
      {moreHref ? (
        <Button asChild variant="outline" size="sm">
          <Link href={moreHref} scroll={false}>
            Load more creators
          </Link>
        </Button>
      ) : null}

      {/* Floating invite bar: appears once someone is picked, and reports the send. */}
      {showBar ? (
        <section
          aria-label="Send invites"
          className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-xl rounded-2xl border bg-card/95 p-3 shadow-2xl ring-1 ring-black/40 backdrop-blur motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 sm:bottom-5"
        >
          {picked.size > 0 ? (
            <div className="flex items-center gap-2">
              <p className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium tabular-nums">
                <Users className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                {picked.size} selected
                {soldOut ? (
                  <span className="truncate text-xs font-normal text-amber-300">· All tickets are claimed</span>
                ) : overInvited ? (
                  <span className="truncate text-xs font-normal text-muted-foreground">
                    {`· ${ticketsLeft} ticket${ticketsLeft === 1 ? "" : "s"}, first to accept`}
                  </span>
                ) : null}
              </p>
              <Button type="button" variant="ghost" size="sm" onClick={() => setPicked(new Set())}>
                <X className="size-4" aria-hidden /> Clear
              </Button>
              <SubmitButton size="sm" disabled={soldOut} pendingLabel="Sending…">
                <Send className="size-4" aria-hidden />
                {`Invite ${picked.size} creator${picked.size === 1 ? "" : "s"}`}
              </SubmitButton>
            </div>
          ) : notice ? (
            <div className="flex items-center gap-2">
              <p
                role={"error" in notice ? "alert" : "status"}
                className={cn(
                  "min-w-0 flex-1 text-sm font-medium",
                  "error" in notice ? "text-red-400" : "text-foreground",
                )}
              >
                {"error" in notice ? notice.error : "success" in notice ? notice.success : null}
              </p>
              <Button type="button" variant="ghost" size="icon" aria-label="Dismiss" onClick={() => setNotice(null)}>
                <X className="size-4" aria-hidden />
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}
    </form>
  );
}

function Group({
  title,
  creators,
  total,
  picked,
  sent,
  onToggle,
  folded = false,
}: {
  title: string;
  creators: SuggestedCreator[];
  total: number;
  picked: Set<string>;
  sent: Set<string>;
  onToggle: (id: string) => void;
  /** Starts closed behind its heading. */
  folded?: boolean;
}) {
  const [open, setOpen] = useState(!folded);
  const [showAll, setShowAll] = useState(false);
  if (!creators.length) return null;
  const shown = showAll ? creators : creators.slice(0, FIRST_SHOWN);
  const heading = (
    <>
      {title} <span className="font-normal text-muted-foreground tabular-nums">({total})</span>
    </>
  );
  return (
    <fieldset className="space-y-2">
      {folded ? (
        <legend className="mb-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="flex items-center gap-1.5 text-sm font-semibold hover:text-foreground/80"
          >
            {heading}
            <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
          </button>
        </legend>
      ) : (
        <legend className="mb-2 text-sm font-semibold">{heading}</legend>
      )}
      {open ? (
        <>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {shown.map((c) => {
              const invited = c.taken || sent.has(c.id);
              return (
                <li key={c.id}>
                  <CreatorCheckCard
                    creator={c}
                    checked={picked.has(c.id)}
                    onToggle={() => onToggle(c.id)}
                    disabled={invited}
                    note={invited ? "Already invited" : null}
                  />
                </li>
              );
            })}
          </ul>
          {creators.length > FIRST_SHOWN ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Show fewer" : `Show all ${creators.length}${total > creators.length ? " loaded" : ""}`}
            </Button>
          ) : null}
        </>
      ) : null}
    </fieldset>
  );
}
