"use client";

import { useActionState, useMemo, useState } from "react";
import { saveShowAction, type ActionState } from "../actions";
import { authorizationAmountCents, formatCents, parseDollarsToCents } from "@/lib/money";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import { Plus, Trash2 } from "lucide-react";

type Deliverable = {
  platform:
    | "instagram_story" | "instagram_reel" | "instagram_post" | "tiktok_video"
    | "youtube_short" | "youtube_video" | "twitter_post" | "other";
  quantity: number;
  description: string;
};

const PLATFORM_LABELS: Array<[Deliverable["platform"], string]> = [
  ["tiktok_video", "TikTok video"],
  ["instagram_reel", "Instagram Reel"],
  ["instagram_story", "Instagram Story"],
  ["instagram_post", "Instagram Post"],
  ["youtube_short", "YouTube Short"],
  ["youtube_video", "YouTube video"],
  ["twitter_post", "X / Twitter post"],
  ["other", "Other"],
];

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
  statedTicketValue?: string;
  depositPercentage?: number;
  creatorPayment?: string;
  plusOneAllowed?: boolean;
  ticketsTotal?: number;
  applicationDeadline?: string;
  contentDeadlineDays?: number;
  notes?: string;
  deliverables?: Deliverable[];
  isPublished?: boolean;
};

export function ShowForm({
  artists,
  tours,
  depositTemplates,
  initial,
}: {
  artists: { id: string; name: string }[];
  tours: { id: string; name: string; artistId: string }[];
  depositTemplates: number[];
  initial: ShowFormInitial;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(saveShowAction, null);
  const [artistId, setArtistId] = useState(initial.artistId ?? artists[0]?.id ?? "");
  const [depositPct, setDepositPct] = useState(initial.depositPercentage ?? depositTemplates[1] ?? 50);
  const [ticketValue, setTicketValue] = useState(initial.statedTicketValue ?? "");
  const [plusOne, setPlusOne] = useState(initial.plusOneAllowed ?? true);
  const [deliverables, setDeliverables] = useState<Deliverable[]>(initial.deliverables ?? []);

  const artistTours = tours.filter((tour) => tour.artistId === artistId);

  const holdPreview = useMemo(() => {
    try {
      const cents = parseDollarsToCents(ticketValue || "0");
      return {
        one: authorizationAmountCents(cents, 1, depositPct),
        two: authorizationAmountCents(cents, 2, depositPct),
      };
    } catch {
      return null;
    }
  }, [ticketValue, depositPct]);

  const patchDeliverable = (index: number, patch: Partial<Deliverable>) =>
    setDeliverables((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));

  return (
    <form action={formAction} className="space-y-6">
      {initial.showId ? <input type="hidden" name="showId" value={initial.showId} /> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Show details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
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
          <div className="space-y-1.5">
            <Label htmlFor="venue-name">Venue name</Label>
            <Input id="venue-name" name="venueName" defaultValue={initial.venueName ?? ""} placeholder="The Echoplex" required />
          </div>
          <div className="grid grid-cols-[1fr_90px] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="venue-city">City</Label>
              <Input id="venue-city" name="venueCity" defaultValue={initial.venueCity ?? ""} placeholder="Los Angeles" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="venue-state">State</Label>
              <Input id="venue-state" name="venueState" defaultValue={initial.venueState ?? ""} placeholder="CA" />
            </div>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="venue-address">Address (optional)</Label>
            <Input id="venue-address" name="venueAddress" defaultValue={initial.venueAddress ?? ""} placeholder="1154 Glendale Blvd" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="show-date">Date</Label>
            <Input id="show-date" name="date" type="date" defaultValue={initial.date ?? ""} required />
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
              <Label htmlFor="ticket-value">Stated ticket value (USD, per ticket)</Label>
              <Input
                id="ticket-value"
                name="statedTicketValue"
                inputMode="decimal"
                placeholder="120"
                value={ticketValue}
                onChange={(event) => setTicketValue(event.target.value)}
                required
                aria-describedby="ticket-value-hint"
              />
              <p id="ticket-value-hint" className="text-xs text-muted-foreground">
                Shown to creators as the "stated ticket value".
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
                defaultValue={initial.ticketsTotal ?? 6}
                required
              />
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Deposit percentage</legend>
            <p className="text-xs text-muted-foreground">
              The temporary hold = stated value × tickets × this percentage. Platform templates
              only — no arbitrary flat fees.
            </p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Deposit percentage">
              {depositTemplates.map((pct) => (
                <button
                  key={pct}
                  type="button"
                  role="radio"
                  aria-checked={depositPct === pct}
                  onClick={() => setDepositPct(pct)}
                  className={cn(
                    "rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
                    depositPct === pct
                      ? "border-primary bg-primary/15 text-foreground"
                      : "text-muted-foreground hover:border-muted-foreground/50",
                  )}
                >
                  {pct}%
                </button>
              ))}
            </div>
            <input type="hidden" name="depositPercentage" value={depositPct} />
            {holdPreview && ticketValue ? (
              <p className="text-xs text-muted-foreground" role="status">
                Hold preview: {formatCents(holdPreview.one)} for 1 ticket
                {plusOne ? ` · ${formatCents(holdPreview.two)} with a +1` : ""}
              </p>
            ) : null}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="creator-payment">Creator payment (USD, 0 = attend-only)</Label>
              <Input
                id="creator-payment"
                name="creatorPayment"
                inputMode="decimal"
                placeholder="150"
                defaultValue={initial.creatorPayment ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="application-deadline">Application deadline</Label>
              <Input
                id="application-deadline"
                name="applicationDeadline"
                type="datetime-local"
                defaultValue={initial.applicationDeadline ?? ""}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="content-deadline-days">Content due (days after show)</Label>
              <Input
                id="content-deadline-days"
                name="contentDeadlineDays"
                type="number"
                min={0}
                max={90}
                defaultValue={initial.contentDeadlineDays ?? 7}
              />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Checkbox
                id="plus-one"
                name="plusOneAllowed"
                checked={plusOne}
                onCheckedChange={(checked) => setPlusOne(checked === true)}
              />
              <Label htmlFor="plus-one">Allow +1 guest tickets</Label>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Content deliverables</p>
            {deliverables.map((deliverable, index) => (
              <div key={index} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[170px_80px_1fr_auto]">
                <div>
                  <Label htmlFor={`deliverable-platform-${index}`} className="text-xs">Platform</Label>
                  <Select
                    value={deliverable.platform}
                    onValueChange={(value) =>
                      patchDeliverable(index, { platform: value as Deliverable["platform"] })
                    }
                  >
                    <SelectTrigger id={`deliverable-platform-${index}`} className="mt-1 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PLATFORM_LABELS.map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor={`deliverable-qty-${index}`} className="text-xs">Qty</Label>
                  <Input
                    id={`deliverable-qty-${index}`}
                    className="mt-1"
                    type="number"
                    min={1}
                    max={20}
                    value={deliverable.quantity}
                    onChange={(event) =>
                      patchDeliverable(index, { quantity: parseInt(event.target.value || "1", 10) })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor={`deliverable-desc-${index}`} className="text-xs">Requirements</Label>
                  <Input
                    id={`deliverable-desc-${index}`}
                    className="mt-1"
                    maxLength={300}
                    value={deliverable.description}
                    onChange={(event) => patchDeliverable(index, { description: event.target.value })}
                    placeholder="≥30s, tag @artist, posted within 48h"
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove deliverable"
                    onClick={() => setDeliverables((prev) => prev.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setDeliverables((prev) =>
                  prev.length < 8
                    ? [...prev, { platform: "tiktok_video", quantity: 1, description: "" }]
                    : prev,
                )
              }
            >
              <Plus className="size-4" aria-hidden /> Add deliverable
            </Button>
            <input type="hidden" name="deliverables" value={JSON.stringify(deliverables)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="opportunity-notes">Notes for creators (optional)</Label>
            <Textarea id="opportunity-notes" name="notes" rows={2} maxLength={1000} defaultValue={initial.notes ?? ""} />
          </div>
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
