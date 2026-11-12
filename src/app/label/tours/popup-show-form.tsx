"use client";

import { useActionState, useState } from "react";
import { createPopupShowAction, type ActionState } from "../actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { SubmitButton } from "@/components/submit-button";
import { ArtistSelector } from "./artist-selector";
import { VenueFields } from "../shows/venue-fields";
import { ContentFields } from "../shows/content-fields";

/**
 * Quick one-off pop-up: a standalone show (no tour) in a city, published
 * instantly. Everything not asked here uses a default (see createPopupShowAction).
 */
export function PopupShowForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(createPopupShowAction, null);
  const [date, setDate] = useState("");
  // "Apply by" is the show date until the label picks another day.
  const [applyBy, setApplyBy] = useState<string | null>(null);

  return (
    <form action={formAction} className="space-y-4">
      <ArtistSelector />

      <VenueFields idPrefix="pop" compact />

      <label
        htmlFor="pop-hide"
        className="flex cursor-pointer items-center gap-2.5 rounded-lg border p-3"
      >
        <Checkbox id="pop-hide" name="hideLocation" value="on" />
        <span className="text-sm font-medium">Hide exact location until approved</span>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="pop-date">Show date</Label>
          <Input id="pop-date" name="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pop-deadline">Apply by</Label>
          <Input
            id="pop-deadline"
            name="applicationDeadline"
            type="date"
            value={applyBy ?? date}
            onChange={(e) => setApplyBy(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="pop-tickets">Tickets for creators</Label>
          <Input id="pop-tickets" name="ticketsTotal" type="number" min={1} max={500} defaultValue={3} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pop-deposit">Deposit per ticket (USD)</Label>
          <Input id="pop-deposit" name="depositPerTicket" inputMode="decimal" placeholder="100" defaultValue="100" required />
        </div>
      </div>

      <div className="rounded-lg border p-3">
        <ContentFields idPrefix="pop" mode="quick" defaultDueDays={2} withDueDays={false} />
      </div>

      {state && "error" in state ? (
        <p role="alert" className="text-sm font-medium text-red-400">{state.error}</p>
      ) : null}
      <SubmitButton className="w-full" pendingLabel="Publishing…">
        Publish event
      </SubmitButton>
    </form>
  );
}
