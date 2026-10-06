"use client";

import { useActionState, useState } from "react";
import { requestForCreatorAction, type ActionState } from "../../actions";
import { formatCents } from "@/lib/money";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/submit-button";

export function RequestForCreatorForm({
  opportunityId,
  creators,
  defaultCreatorId,
  plusOneAllowed,
  holdOneCents,
  holdTwoCents,
}: {
  opportunityId: string;
  creators: { id: string; name: string; city: string; hasCard: boolean }[];
  defaultCreatorId?: string;
  plusOneAllowed: boolean;
  holdOneCents: number;
  holdTwoCents: number;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(requestForCreatorAction, null);
  const [creatorId, setCreatorId] = useState(defaultCreatorId ?? creators[0]?.id ?? "");
  const selected = creators.find((c) => c.id === creatorId);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="opportunityId" value={opportunityId} />
      <div className="space-y-2">
        <Label htmlFor="request-creator">Creator</Label>
        <select
          id="request-creator"
          name="creatorId"
          value={creatorId}
          onChange={(e) => setCreatorId(e.target.value)}
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-base md:text-sm dark:bg-input/30"
        >
          {creators.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.city ? ` — ${c.city}` : ""}
            </option>
          ))}
        </select>
        {selected && !selected.hasCard ? (
          <p className="text-xs text-amber-300">
            {selected.name.split(" ")[0]} hasn&apos;t added a card yet — they&apos;ll need one to
            accept if approved.
          </p>
        ) : null}
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Tickets</legend>
        <label className="flex cursor-pointer items-center justify-between rounded-lg border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10">
          <span className="flex items-center gap-2">
            <input type="radio" name="ticketCount" value="1" defaultChecked className="accent-primary" />
            Just the creator
          </span>
          <span className="text-xs text-muted-foreground">hold {formatCents(holdOneCents)}</span>
        </label>
        {plusOneAllowed ? (
          <label className="flex cursor-pointer items-center justify-between rounded-lg border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10">
            <span className="flex items-center gap-2">
              <input type="radio" name="ticketCount" value="2" className="accent-primary" />
              Creator + 1 guest
            </span>
            <span className="text-xs text-muted-foreground">hold {formatCents(holdTwoCents)}</span>
          </label>
        ) : null}
        <p className="text-xs text-muted-foreground">
          The hold goes on the creator&apos;s own card when they accept the booking.
        </p>
      </fieldset>
      <div className="space-y-2">
        <Label htmlFor="request-message">Pitch for the artist team (optional)</Label>
        <Textarea
          id="request-message"
          name="message"
          rows={4}
          maxLength={1000}
          placeholder="Audience, past concert content, what they'd post…"
        />
      </div>
      {state && "error" in state ? (
        <p role="alert" className="text-sm font-medium text-red-400">
          {state.error}
        </p>
      ) : null}
      <SubmitButton className="w-full" pendingLabel="Sending request…" disabled={!creatorId}>
        Request tickets
      </SubmitButton>
    </form>
  );
}
