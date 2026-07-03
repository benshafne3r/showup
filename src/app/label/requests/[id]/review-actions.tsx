"use client";

import { useActionState, useState } from "react";
import {
  approveRequestAction,
  rejectRequestAction,
  waitlistRequestAction,
  type ActionState,
} from "../../actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SubmitButton } from "@/components/submit-button";
import { Check, Hourglass, X } from "lucide-react";

export function ReviewActions({
  requestId,
  requestedTickets,
  includesPlusOne,
  remaining,
}: {
  requestId: string;
  requestedTickets: 1 | 2;
  includesPlusOne: boolean;
  remaining: number;
}) {
  const [approveState, approveAction] = useActionState<ActionState, FormData>(approveRequestAction, null);
  const [rejectState, rejectAction] = useActionState<ActionState, FormData>(rejectRequestAction, null);
  const [waitlistState, waitlistAction] = useActionState<ActionState, FormData>(waitlistRequestAction, null);
  const [confirmedCount, setConfirmedCount] = useState(String(requestedTickets));

  const success =
    (approveState && "success" in approveState && approveState.success) ||
    (rejectState && "success" in rejectState && rejectState.success) ||
    (waitlistState && "success" in waitlistState && waitlistState.success);
  const error =
    (approveState && "error" in approveState && approveState.error) ||
    (rejectState && "error" in rejectState && rejectState.error) ||
    (waitlistState && "error" in waitlistState && waitlistState.error);

  if (success) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p role="status" className="text-sm font-medium text-emerald-300">
            {success}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Decision</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {includesPlusOne ? (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Confirm ticket count</legend>
            <RadioGroup value={confirmedCount} onValueChange={setConfirmedCount} className="gap-2">
              <Label htmlFor="approve-two" className="flex cursor-pointer items-center gap-2 rounded-lg border p-2.5">
                <RadioGroupItem id="approve-two" value="2" />
                Approve with the +1 (2 tickets)
              </Label>
              <Label htmlFor="approve-one" className="flex cursor-pointer items-center gap-2 rounded-lg border p-2.5">
                <RadioGroupItem id="approve-one" value="1" />
                Approve creator only (1 ticket)
              </Label>
            </RadioGroup>
          </fieldset>
        ) : null}

        <form action={approveAction}>
          <input type="hidden" name="requestId" value={requestId} />
          <input type="hidden" name="confirmedTicketCount" value={confirmedCount} />
          <SubmitButton
            className="w-full"
            disabled={remaining < parseInt(confirmedCount, 10)}
            pendingLabel="Approving…"
          >
            <Check className="size-4" aria-hidden /> Approve
          </SubmitButton>
        </form>
        {remaining < parseInt(confirmedCount, 10) ? (
          <p className="text-xs text-red-300">Not enough tickets left for this approval.</p>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <form action={waitlistAction}>
            <input type="hidden" name="requestId" value={requestId} />
            <SubmitButton variant="outline" className="w-full" pendingLabel="…">
              <Hourglass className="size-4" aria-hidden /> Waitlist
            </SubmitButton>
          </form>
          <form action={rejectAction}>
            <input type="hidden" name="requestId" value={requestId} />
            <SubmitButton variant="outline" className="w-full" pendingLabel="…">
              <X className="size-4" aria-hidden /> Decline
            </SubmitButton>
          </form>
        </div>

        {error ? (
          <p role="alert" className="text-sm font-medium text-red-400">
            {error}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Approving reserves the tickets and gives the creator 24 hours to accept. If they don't,
          the spot is automatically released.
        </p>
      </CardContent>
    </Card>
  );
}
