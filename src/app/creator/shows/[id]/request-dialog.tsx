"use client";

import { useActionState, useState } from "react";
import { requestAccess, type ActionState } from "../../actions";
import { formatCents } from "@/lib/money";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/submit-button";

export function RequestAccessDialog({
  opportunityId,
  artistName,
  plusOneAllowed,
  holdOneCents,
  holdTwoCents,
}: {
  opportunityId: string;
  artistName: string;
  plusOneAllowed: boolean;
  holdOneCents: number;
  holdTwoCents: number;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(requestAccess, null);
  const [ticketCount, setTicketCount] = useState<"1" | "2">("1");

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="w-full" size="lg">
          Request free ticket
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request access — {artistName}</DialogTitle>
          <DialogDescription>
            Tell the team why you're a great fit. Approval gives you 24 hours to confirm.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="opportunityId" value={opportunityId} />
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Tickets</legend>
            <RadioGroup
              name="ticketCount"
              value={ticketCount}
              onValueChange={(value) => setTicketCount(value as "1" | "2")}
              className="gap-2"
            >
              <Label
                htmlFor="ticket-one"
                className="flex cursor-pointer items-center justify-between rounded-lg border p-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/10"
              >
                <span className="flex items-center gap-2">
                  <RadioGroupItem id="ticket-one" value="1" />
                  Just me
                </span>
                <span className="text-xs text-muted-foreground">
                  hold {formatCents(holdOneCents)}
                </span>
              </Label>
              {plusOneAllowed ? (
                <Label
                  htmlFor="ticket-two"
                  className="flex cursor-pointer items-center justify-between rounded-lg border p-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/10"
                >
                  <span className="flex items-center gap-2">
                    <RadioGroupItem id="ticket-two" value="2" />
                    Me + 1 guest
                  </span>
                  <span className="text-xs text-muted-foreground">
                    hold {formatCents(holdTwoCents)}
                  </span>
                </Label>
              ) : null}
            </RadioGroup>
            <p className="text-xs text-muted-foreground">
              The temporary hold covers every ticket you request. Attend and it's released —
              you won't be charged.
            </p>
          </fieldset>
          <div className="space-y-2">
            <Label htmlFor="request-message">Message or content idea (optional)</Label>
            <Textarea
              id="request-message"
              name="message"
              rows={4}
              maxLength={1000}
              placeholder="Pitch your angle — audience, past concert content, what you'd post…"
            />
          </div>
          {state && "error" in state ? (
            <p role="alert" className="text-sm font-medium text-red-400">
              {state.error}
            </p>
          ) : null}
          <SubmitButton className="w-full" pendingLabel="Sending request…">
            Send request
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
