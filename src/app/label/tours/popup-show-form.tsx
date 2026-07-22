"use client";

import { useActionState } from "react";
import { createPopupShowAction, type ActionState } from "../actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubmitButton } from "@/components/submit-button";
import { ArtistSelector } from "./artist-selector";

/**
 * Quick one-off pop-up: a standalone show (no tour) in a city, published
 * instantly. Everything not asked here uses a default (see createPopupShowAction).
 */
export function PopupShowForm({ artists }: { artists: { id: string; name: string }[] }) {
  const [state, formAction] = useActionState<ActionState, FormData>(createPopupShowAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <ArtistSelector artists={artists} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="pop-venue">Venue / Address</Label>
          <Input
            id="pop-venue"
            name="venueName"
            placeholder="The Echoplex — or 1155 Sunset Blvd"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pop-city">City</Label>
          <Input id="pop-city" name="venueCity" placeholder="Los Angeles" required />
        </div>
      </div>

      <label
        htmlFor="pop-hide"
        className="flex cursor-pointer items-start gap-2.5 rounded-lg border p-3"
      >
        <Checkbox id="pop-hide" name="hideLocation" value="on" className="mt-0.5" />
        <span>
          <span className="block text-sm font-medium">Hide exact location until approved</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Creators see only the city — the venue/address is revealed once you approve
            them. Good for secret pop-ups.
          </span>
        </span>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="pop-date">Show date</Label>
          <Input id="pop-date" name="date" type="date" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pop-deadline">Apply by</Label>
          <Input id="pop-deadline" name="applicationDeadline" type="date" required />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="pop-tickets">Tickets for creators</Label>
          <Input id="pop-tickets" name="ticketsTotal" type="number" min={1} max={500} defaultValue={4} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pop-value">Ticket value (USD)</Label>
          <Input id="pop-value" name="statedTicketValue" inputMode="decimal" placeholder="120" required />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="pop-pay">Creator payment (USD)</Label>
          <Input id="pop-pay" name="creatorPayment" inputMode="decimal" placeholder="0 = attend-only" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pop-content">Content ask</Label>
          <Select name="contentPlatform" defaultValue="none">
            <SelectTrigger id="pop-content" className="w-full">
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
      </div>

      {state && "error" in state ? (
        <p role="alert" className="text-sm font-medium text-red-400">{state.error}</p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Publishes immediately so creators can request it right away.
      </p>
      <SubmitButton className="w-full" pendingLabel="Publishing…">
        Publish event
      </SubmitButton>
    </form>
  );
}
