"use client";

import { useRef, useState, useTransition, useActionState } from "react";
import { searchArtistEvents } from "../import-actions";
import { bulkImportShowsAction } from "../actions";
import type { ActionState } from "../actions";
import type { ExternalEvent } from "@/server/providers/events/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubmitButton } from "@/components/submit-button";
import { formatShowDate } from "@/lib/dates";
import { ArtistSelector } from "../tours/artist-selector";
import type { PickedArtist } from "../tours/spotify-artist-picker";
import { CalendarArrowDown, Loader2, MapPin } from "lucide-react";

type Tour = { id: string; name: string; artistId: string };

/**
 * Bulk import: search Spotify for the artist, which pulls their announced
 * dates; select the ones you want, set the opportunity terms once, and
 * publish a show for every selected date.
 */
export function BulkImportForm({
  tours,
  contentDeadlineDefaultDays,
}: {
  tours: Tour[];
  contentDeadlineDefaultDays: number;
}) {
  const [artist, setArtist] = useState<PickedArtist | null>(null);
  // The label's existing artist for the pick (null = new), for the tour list.
  const [artistId, setArtistId] = useState<string | null>(null);
  const fetchedFor = useRef("");
  const [events, setEvents] = useState<ExternalEvent[] | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [pending, startTransition] = useTransition();
  const [state, formAction] = useActionState<ActionState, FormData>(bulkImportShowsAction, null);

  const artistTours = artistId ? tours.filter((t) => t.artistId === artistId) : [];

  const fetchEvents = (picked: PickedArtist) => {
    setFetchError(null);
    setEvents(null);
    setSelected(new Set());
    startTransition(async () => {
      const result = await searchArtistEvents({ name: picked.name, spotifyUrl: picked.spotifyUrl });
      if (!result.ok) {
        setFetchError(result.error);
        return;
      }
      setEvents(result.events);
      setProvider(result.provider);
      setArtistId(result.artistId);
      // Pre-select everything — the whole point is "pull in all the shows".
      setSelected(new Set(result.events.map((_, i) => i)));
    });
  };

  // The picker reports twice per pick (Spotify data, then bio); fetch once.
  const pickArtist = (picked: PickedArtist) => {
    setArtist(picked);
    if (picked.spotifyUrl === fetchedFor.current) return;
    fetchedFor.current = picked.spotifyUrl;
    fetchEvents(picked);
  };

  const toggle = (i: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const allSelected = events != null && events.length > 0 && selected.size === events.length;
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set((events ?? []).map((_, i) => i)));

  const selectedDates = (events ?? [])
    .filter((_, i) => selected.has(i))
    .map((e) => ({
      venueName: e.venueName,
      venueCity: e.city,
      venueState: e.region,
      date: e.date,
      startTime: e.startTime,
    }));

  return (
    <form action={formAction} className="space-y-6">
      {/* 1 · Pick the artist and pull their dates */}
      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarArrowDown className="size-4 text-primary" aria-hidden /> Pull tour dates
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ArtistSelector onChange={pickArtist} />
          {artistTours.length > 0 ? (
            <div className="space-y-1.5">
              <Label htmlFor="bulk-tour">Add to tour (optional)</Label>
              <Select key={artistId} name="tourId" defaultValue="none">
                <SelectTrigger id="bulk-tour" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No tour</SelectItem>
                  {artistTours.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {pending ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Looking up tour dates
            </p>
          ) : null}
          {fetchError ? (
            <p role="alert" className="text-sm font-medium text-red-400">
              {fetchError}{" "}
              {artist ? (
                <button type="button" onClick={() => fetchEvents(artist)} className="underline underline-offset-2">
                  Try again
                </button>
              ) : null}
            </p>
          ) : null}
          {events && events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No upcoming dates listed for {artist?.name ?? "this artist"}.</p>
          ) : null}

          {events && events.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {events.length} date{events.length === 1 ? "" : "s"} from{" "}
                  <span className="capitalize">{provider}</span>
                  {provider === "demo" ? " (offline sample: set BANDSINTOWN_APP_ID for live data)" : ""}
                </p>
                <button type="button" onClick={toggleAll} className="text-xs font-medium text-primary hover:underline">
                  {allSelected ? "Deselect all" : "Select all"}
                </button>
              </div>
              <ul className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
                {events.map((event, i) => (
                  <li key={`${event.date}-${event.venueName}-${i}`}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-lg border bg-card px-3 py-2 text-sm transition-colors hover:border-primary/50 has-checked:border-primary/60 has-checked:bg-primary/5">
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={selected.has(i)}
                        onChange={() => toggle(i)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{formatShowDate(event.date)}</span>
                        <span className="ml-2 text-muted-foreground">{event.venueName}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="size-3" aria-hidden />
                        {event.city}{event.region ? `, ${event.region}` : ""}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* 2 · Shared terms applied to every selected date */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Terms for every selected show</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="bulk-deposit">Deposit per ticket (USD)</Label>
            <Input id="bulk-deposit" name="depositPerTicket" inputMode="decimal" placeholder="50" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bulk-tickets">Tickets per show</Label>
            <Input id="bulk-tickets" name="ticketsTotal" type="number" min={1} max={500} defaultValue={4} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bulk-pay">Creator payment (USD)</Label>
            <Input id="bulk-pay" name="creatorPayment" inputMode="decimal" placeholder="0 = attend-only" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bulk-content">Content ask</Label>
            <Select name="contentPlatform" defaultValue="none">
              <SelectTrigger id="bulk-content" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Attend-only (no post)</SelectItem>
                <SelectItem value="instagram_reel">1 × Instagram Reel</SelectItem>
                <SelectItem value="instagram_story">1 × Instagram Story</SelectItem>
                <SelectItem value="instagram_post">1 × Instagram Post</SelectItem>
                <SelectItem value="tiktok_video">1 × TikTok</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bulk-delivery">Ticket delivery</Label>
            <Select name="ticketDeliveryMethod" defaultValue="guest_list">
              <SelectTrigger id="bulk-delivery" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="guest_list">Guest list</SelectItem>
                <SelectItem value="will_call">Will call</SelectItem>
                <SelectItem value="digital_transfer">Digital transfer</SelectItem>
                <SelectItem value="box_office">Box office</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bulk-deadline">Applications close (days before each show)</Label>
            <Input id="bulk-deadline" name="deadlineDaysBefore" type="number" min={0} max={120} defaultValue={7} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bulk-content-days">Content due (days after show)</Label>
            <Input id="bulk-content-days" name="contentDeadlineDays" type="number" min={0} max={90} defaultValue={contentDeadlineDefaultDays} required />
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="plusOneAllowed" className="size-4 accent-primary" />
            Allow a +1 guest
          </label>
        </CardContent>
      </Card>

      <input type="hidden" name="dates" value={JSON.stringify(selectedDates)} />

      {state && "error" in state ? (
        <p role="alert" className="text-sm font-medium text-red-400">{state.error}</p>
      ) : null}
      <div className="flex items-center gap-3">
        <SubmitButton size="lg" pendingLabel="Publishing…" disabled={!artist || selectedDates.length === 0}>
          Publish {selectedDates.length || ""} show{selectedDates.length === 1 ? "" : "s"}
        </SubmitButton>
      </div>
    </form>
  );
}
