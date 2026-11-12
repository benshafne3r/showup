"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { searchArtistEvents } from "../import-actions";
import type { ExternalEvent } from "@/server/providers/events/types";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatShowDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { ShowForm, type LockedTour, type ShowFormInitial } from "./show-form";
import { Check, Loader2, MapPin } from "lucide-react";

const dateKey = (date: string, venue: string) => `${date}|${venue.trim().toLowerCase()}`;

/**
 * "Add a date" on a tour: the tour's artist and tour are fixed, and the
 * artist's announced dates load on open (minus ones already on the tour).
 * Picking one fills the venue, city, date and time in the form below.
 */
export function TourShowForm({
  tour,
  spotifyUrl,
  existing,
  baseInitial,
}: {
  tour: LockedTour;
  spotifyUrl: string;
  /** Dates already on the tour, as date + venue name. */
  existing: { date: string; venueName: string }[];
  baseInitial: ShowFormInitial;
}) {
  const [initial, setInitial] = useState<ShowFormInitial>(baseInitial);
  const [version, setVersion] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [events, setEvents] = useState<ExternalEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLDivElement>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return; // once, even when React runs the effect twice in development
    loaded.current = true;
    startTransition(async () => {
      const result = await searchArtistEvents({ name: tour.artist.name, spotifyUrl });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const taken = new Set(existing.map((e) => dateKey(e.date, e.venueName)));
      setEvents(result.events.filter((e) => !taken.has(dateKey(e.date, e.venueName))));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on open
  }, []);

  const pick = (event: ExternalEvent) => {
    setPicked(dateKey(event.date, event.venueName));
    setInitial({
      ...baseInitial,
      venueName: event.venueName,
      venueCity: event.city,
      venueState: event.region,
      date: event.date,
      startTime: event.startTime ?? baseInitial.startTime,
    });
    setVersion((v) => v + 1);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{tour.artist.name} tour dates</CardTitle>
          {events && events.length > 1 ? (
            <CardAction>
              <Link
                href={`/label/shows/import?tour=${tour.id}`}
                className="text-sm font-medium text-primary underline-offset-2 hover:underline"
              >
                Import several
              </Link>
            </CardAction>
          ) : null}
        </CardHeader>
        <CardContent>
          {pending ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Looking up tour dates
            </p>
          ) : error ? (
            <p role="alert" className="text-sm font-medium text-red-400">{error}</p>
          ) : events && events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No other announced dates. Enter the show below.</p>
          ) : events ? (
            <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
              {events.map((event, i) => {
                const selected = picked === dateKey(event.date, event.venueName);
                return (
                  <li key={`${event.date}-${event.venueName}-${i}`}>
                    <button
                      type="button"
                      onClick={() => pick(event)}
                      aria-pressed={selected}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2 text-left text-sm transition-colors hover:border-foreground/40",
                        selected && "border-foreground/60 bg-muted/50",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="font-medium">{formatShowDate(event.date)}</span>
                        <span className="ml-2 text-muted-foreground">{event.venueName}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                        <MapPin className="size-3" aria-hidden />
                        {event.city}
                        {event.region ? `, ${event.region}` : ""}
                        {selected ? <Check className="size-4 text-foreground" aria-hidden /> : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      <div ref={formRef}>
        <ShowForm key={version} artists={[]} tours={[]} initial={initial} lockedTour={tour} />
      </div>
    </div>
  );
}
