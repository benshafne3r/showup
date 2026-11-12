"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { searchArtistEvents } from "../import-actions";
import type { ExternalEvent } from "@/server/providers/events/types";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatShowDate } from "@/lib/dates";
import { ShowForm, type LockedTour, type ShowFormInitial } from "./show-form";

const dateKey = (date: string, venue: string) => `${date}|${venue.trim().toLowerCase()}`;

/**
 * "Add a date" on a tour: the tour's artist and tour are fixed, and the
 * artist's announced dates load on open (minus ones already on the tour) into
 * a dropdown. Picking one fills the venue, city, date and time in the form below.
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
      // Skip dates already on the tour (and repeat listings of one date).
      setEvents(
        result.events.filter((e) => {
          const key = dateKey(e.date, e.venueName);
          if (taken.has(key)) return false;
          taken.add(key);
          return true;
        }),
      );
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
        <CardContent className="space-y-2">
          <Select
            value={picked ?? ""}
            onValueChange={(value) => {
              const event = events?.find((e) => dateKey(e.date, e.venueName) === value);
              if (event) pick(event);
            }}
            disabled={pending || !events?.length}
          >
            <SelectTrigger aria-label="Pick a tour date" className="w-full">
              <SelectValue
                placeholder={
                  pending
                    ? "Looking up tour dates…"
                    : events && events.length === 0
                      ? "No other announced dates"
                      : "Pick a date"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {(events ?? []).map((event) => (
                <SelectItem key={dateKey(event.date, event.venueName)} value={dateKey(event.date, event.venueName)}>
                  <span className="font-medium">{formatShowDate(event.date)}</span>
                  <span className="text-muted-foreground">
                    {event.venueName} · {event.city}
                    {event.region ? `, ${event.region}` : ""}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {error ? (
            <p role="alert" className="text-sm font-medium text-red-400">{error}</p>
          ) : null}
        </CardContent>
      </Card>

      <div ref={formRef}>
        <ShowForm key={version} artists={[]} tours={[]} initial={initial} lockedTour={tour} />
      </div>
    </div>
  );
}
