"use client";

import { useState, useTransition } from "react";
import { searchArtistEvents } from "../import-actions";
import type { ExternalEvent } from "@/server/providers/events/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatShowDate } from "@/lib/dates";
import { CalendarArrowDown, MapPin } from "lucide-react";

export type ImportedShow = {
  artistId: string;
  venueName: string;
  venueCity: string;
  venueState: string;
  date: string;
  startTime?: string;
};

/**
 * Pulls an artist's announced tour dates from the event provider and lets the
 * label click one to prefill the show form.
 */
export function ImportPanel({
  artists,
  onImport,
}: {
  artists: { id: string; name: string }[];
  onImport: (show: ImportedShow) => void;
}) {
  const [artistId, setArtistId] = useState(artists[0]?.id ?? "");
  const [events, setEvents] = useState<ExternalEvent[] | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const fetchEvents = () => {
    setError(null);
    setEvents(null);
    startTransition(async () => {
      const result = await searchArtistEvents(artistId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEvents(result.events);
      setProvider(result.provider);
    });
  };

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarArrowDown className="size-4 text-primary" aria-hidden />
          Import a tour date
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Pull an artist's announced dates and click one to prefill the venue, city, and date
          below.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-52 flex-1 space-y-1.5">
            <Label htmlFor="import-artist">Artist</Label>
            <Select value={artistId} onValueChange={setArtistId}>
              <SelectTrigger id="import-artist" className="w-full">
                <SelectValue placeholder="Pick an artist" />
              </SelectTrigger>
              <SelectContent>
                {artists.map((artist) => (
                  <SelectItem key={artist.id} value={artist.id}>
                    {artist.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" variant="secondary" onClick={fetchEvents} disabled={pending || !artistId}>
            {pending ? "Fetching…" : "Fetch tour dates"}
          </Button>
        </div>

        {error ? (
          <p role="alert" className="text-sm font-medium text-red-400">
            {error}
          </p>
        ) : null}

        {events && events.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No upcoming dates found for this artist from the provider.
          </p>
        ) : null}

        {events && events.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {events.length} date{events.length === 1 ? "" : "s"} from{" "}
              <span className="capitalize">{provider}</span>
              {provider === "demo" ? " (offline sample — set BANDSINTOWN_APP_ID for live data)" : ""}
            </p>
            <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
              {events.map((event, index) => (
                <li key={`${event.date}-${event.venueName}-${index}`}>
                  <button
                    type="button"
                    onClick={() =>
                      onImport({
                        artistId,
                        venueName: event.venueName,
                        venueCity: event.city,
                        venueState: event.region,
                        date: event.date,
                        startTime: event.startTime,
                      })
                    }
                    className="flex w-full items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2 text-left text-sm transition-colors hover:border-primary/60 hover:bg-muted/40"
                  >
                    <span className="min-w-0">
                      <span className="font-medium">{formatShowDate(event.date)}</span>
                      <span className="ml-2 text-muted-foreground">{event.venueName}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="size-3" aria-hidden />
                      {event.city}
                      {event.region ? `, ${event.region}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
