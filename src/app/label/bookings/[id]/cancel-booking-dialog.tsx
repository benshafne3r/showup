"use client";

import { useActionState } from "react";
import { cancelBookingAction, type ActionState } from "../../actions";
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
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/submit-button";

export function CancelBookingDialog({ bookingId }: { bookingId: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(cancelBookingAction, null);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full text-red-300 hover:text-red-200">
          Cancel this booking
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel booking?</DialogTitle>
          <DialogDescription>
            The ticket returns to inventory, any hold is released, and the creator is notified.
          </DialogDescription>
        </DialogHeader>
        {state && "success" in state ? (
          <p role="status" className="text-sm text-emerald-300">{state.success}</p>
        ) : (
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="bookingId" value={bookingId} />
            <div className="space-y-1.5">
              <Label htmlFor={`cancel-booking-reason-${bookingId}`}>Reason (shared with the creator)</Label>
              <Textarea
                id={`cancel-booking-reason-${bookingId}`}
                name="reason"
                rows={2}
                maxLength={300}
                required
              />
            </div>
            {state && "error" in state ? (
              <p role="alert" className="text-sm font-medium text-red-400">{state.error}</p>
            ) : null}
            <SubmitButton variant="destructive" className="w-full" pendingLabel="Canceling…">
              Cancel booking
            </SubmitButton>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
