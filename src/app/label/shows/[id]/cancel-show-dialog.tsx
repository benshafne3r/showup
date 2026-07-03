"use client";

import { useActionState } from "react";
import { cancelShowAction, type ActionState } from "../../actions";
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

export function CancelShowDialog({ showId }: { showId: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(cancelShowAction, null);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          Cancel show
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel this show?</DialogTitle>
          <DialogDescription>
            All active bookings are canceled, card holds are released, scheduled holds are
            voided, and every creator is notified. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {state && "success" in state ? (
          <p role="status" className="text-sm text-emerald-300">{state.success}</p>
        ) : (
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="showId" value={showId} />
            <div className="space-y-1.5">
              <Label htmlFor="cancel-reason">Reason (shared with creators)</Label>
              <Textarea id="cancel-reason" name="reason" rows={2} maxLength={300} required placeholder="Routing change / illness / venue issue…" />
            </div>
            {state && "error" in state ? (
              <p role="alert" className="text-sm font-medium text-red-400">{state.error}</p>
            ) : null}
            <SubmitButton variant="destructive" className="w-full" pendingLabel="Canceling…">
              Cancel show &amp; release holds
            </SubmitButton>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
