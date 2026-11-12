"use client";

import { useActionState, useMemo, useState, useSyncExternalStore } from "react";
import { saveShowAction, type ActionState } from "../actions";
import { authorizationAmountCents, formatCents, parseDollarsToCents } from "@/lib/money";
import { formatShowDate } from "@/lib/dates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/submit-button";
import { VenueFields } from "./venue-fields";
import { ContentFields, type Deliverable } from "./content-fields";

export type ShowFormInitial = {
  showId?: string;
  artistId?: string;
  tourId?: string;
  venueName?: string;
  venueCity?: string;
  venueState?: string;
  venueAddress?: string;
  date?: string;
  doorsTime?: string;
  startTime?: string;
  ticketDeliveryMethod?: string;
  depositPerTicket?: string;
  creatorPayment?: string;
  plusOneAllowed?: boolean;
  ticketsTotal?: number;
  /** ISO timestamp (the form shows and edits it in the viewer's own time zone). */
  applicationDeadline?: string;
  contentDeadlineDays?: number;
  notes?: string;
  deliverables?: Deliverable[];
  isPublished?: boolean;
};

/** Adding a date to a known tour: its artist and tour are fixed, not picked. */
export type LockedTour = {
  id: string;
  name: string;
  artist: { id: string; name: string; imageUrl: string | null };
};

const noSubscribe = () => () => {};

/** ISO → "YYYY-MM-DDTHH:mm" in this browser's time zone, for a datetime-local input. */
function localInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ShowForm({
  artists,
  tours,
  initial,
  lockedTour,
}: {
  artists: { id: string; name: string }[];
  tours: { id: string; name: string; artistId: string }[];
  initial: ShowFormInitial;
  lockedTour?: LockedTour;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(saveShowAction, null);
  const [artistId, setArtistId] = useState(initial.artistId ?? artists[0]?.id ?? "");
  const [deposit, setDeposit] = useState(initial.depositPerTicket ?? "100");
  const [plusOne, setPlusOne] = useState(initial.plusOneAllowed ?? true);
  const [date, setDate] = useState(initial.date ?? "");
  const [venue, setVenue] = useState({
    name: initial.venueName ?? "",
    city: initial.venueCity ?? "",
    state: initial.venueState ?? "",
  });
  // Application deadline: noon on the show date until the label sets one. It's
  // entered in their own time zone and sent as an exact time (ISO), so the
  // server never guesses the zone. Saved deadlines are shown once in the browser.
  const [deadlineEdit, setDeadlineEdit] = useState<string | null>(null);
  const inBrowser = useSyncExternalStore(noSubscribe, () => true, () => false);
  const deadlineLocal =
    deadlineEdit ??
    (initial.applicationDeadline
      ? inBrowser
        ? localInputValue(initial.applicationDeadline)
        : ""
      : date
        ? `${date}T12:00`
        : "");
  const deadlineIso = inBrowser && deadlineLocal ? new Date(deadlineLocal).toISOString() : "";

  const artistTours = tours.filter((tour) => tour.artistId === artistId);

  const holdPreview = useMemo(() => {
    try {
      const cents = parseDollarsToCents(deposit || "0");
      return {
        one: authorizationAmountCents(cents, 1, 100),
        two: authorizationAmountCents(cents, 2, 100),
      };
    } catch {
      return null;
    }
  }, [deposit]);

  return (
    <form action={formAction} className="space-y-6">
      {initial.showId ? <input type="hidden" name="showId" value={initial.showId} /> : null}

      {/* overflow-visible: venue and city suggestions drop down past the card. */}
      <Card className="overflow-visible">
        <CardHeader>
          <CardTitle className="text-base">Show details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {lockedTour ? (
            <div className="flex items-center gap-3 rounded-lg border p-2.5 sm:col-span-2">
              {lockedTour.artist.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={lockedTour.artist.imageUrl} alt="" className="size-10 shrink-0 rounded-full object-cover" />
              ) : (
                <span className="size-10 shrink-0 rounded-full bg-muted" />
              )}
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{lockedTour.artist.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[date ? formatShowDate(date) : "", venue.name, [venue.city, venue.state].filter(Boolean).join(", ")]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <input type="hidden" name="artistId" value={lockedTour.artist.id} />
              <input type="hidden" name="tourId" value={lockedTour.id} />
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="show-artist">Artist</Label>
                <Select name="artistId" value={artistId} onValueChange={setArtistId}>
                  <SelectTrigger id="show-artist" className="w-full">
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
              <div className="space-y-1.5">
                <Label htmlFor="show-tour">Tour (optional)</Label>
                <Select name="tourId" defaultValue={initial.tourId || undefined}>
                  <SelectTrigger id="show-tour" className="w-full">
                    <SelectValue placeholder="Standalone show" />
                  </SelectTrigger>
                  <SelectContent>
                    {artistTours.map((tour) => (
                      <SelectItem key={tour.id} value={tour.id}>
                        {tour.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
          <VenueFields idPrefix="venue" initial={initial} onChange={setVenue} />
          <div className="space-y-1.5">
            <Label htmlFor="show-date">Date</Label>
            <Input
              id="show-date"
              name="date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="doors-time">Doors</Label>
              <Input id="doors-time" name="doorsTime" type="time" defaultValue={initial.doorsTime ?? "19:00"} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="start-time">Show</Label>
              <Input id="start-time" name="startTime" type="time" defaultValue={initial.startTime ?? "20:00"} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="delivery-method">Ticket delivery</Label>
            <Select name="ticketDeliveryMethod" defaultValue={initial.ticketDeliveryMethod ?? "guest_list"}>
              <SelectTrigger id="delivery-method" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="guest_list">Guest list</SelectItem>
                <SelectItem value="will_call">Will call</SelectItem>
                <SelectItem value="digital_transfer">Digital transfer</SelectItem>
                <SelectItem value="box_office">Box office pickup</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="show-image">Show image (optional)</Label>
            <Input id="show-image" name="image" type="file" accept="image/jpeg,image/png,image/webp" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Creator opportunity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="deposit-per-ticket">Deposit per ticket (USD)</Label>
              <Input
                id="deposit-per-ticket"
                name="depositPerTicket"
                inputMode="decimal"
                placeholder="100"
                value={deposit}
                onChange={(event) => setDeposit(event.target.value)}
                required
                aria-describedby="deposit-hint"
              />
              <p id="deposit-hint" className="text-xs text-muted-foreground tabular-nums" role="status">
                {holdPreview && deposit
                  ? `Hold: ${formatCents(holdPreview.one)} for 1 ticket${plusOne ? `, ${formatCents(holdPreview.two)} with a +1` : ""}`
                  : ""}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tickets-total">Tickets available to creators</Label>
              <Input
                id="tickets-total"
                name="ticketsTotal"
                type="number"
                min={1}
                max={500}
                defaultValue={initial.ticketsTotal ?? 3}
                required
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="application-deadline">Application deadline</Label>
              <Input
                id="application-deadline"
                type="datetime-local"
                value={deadlineLocal}
                onChange={(event) => setDeadlineEdit(event.target.value)}
                required
              />
              <input type="hidden" name="applicationDeadline" value={deadlineIso} />
            </div>
            <div className="flex items-center gap-2 sm:pt-6">
              <Checkbox
                id="plus-one"
                name="plusOneAllowed"
                checked={plusOne}
                onCheckedChange={(checked) => setPlusOne(checked === true)}
              />
              <Label htmlFor="plus-one">Allow +1 guest tickets</Label>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="opportunity-notes">Notes for creators (optional)</Label>
            <Textarea id="opportunity-notes" name="notes" rows={2} maxLength={1000} defaultValue={initial.notes ?? ""} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Content</CardTitle>
        </CardHeader>
        <CardContent>
          <ContentFields
            idPrefix="show"
            mode="list"
            initial={initial}
            defaultDueDays={initial.contentDeadlineDays ?? 7}
          />
        </CardContent>
      </Card>

      {state && "error" in state ? (
        <p role="alert" className="text-sm font-medium text-red-400">{state.error}</p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <SubmitButton name="publish" value="true" size="lg" pendingLabel="Publishing…">
          {initial.isPublished ? "Save & keep published" : "Publish show"}
        </SubmitButton>
        {!initial.isPublished ? (
          <SubmitButton name="publish" value="false" variant="outline" size="lg" pendingLabel="Saving…">
            Save as draft
          </SubmitButton>
        ) : null}
      </div>
    </form>
  );
}
