"use client";

import { useActionState } from "react";
import { openDisputeAction, type ActionState } from "../../actions";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/submit-button";

export function DisputeDialog({ bookingId }: { bookingId: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(openDisputeAction, null);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground">
          Something wrong? Open a dispute
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Open a dispute</DialogTitle>
          <DialogDescription>
            Money movement on this booking pauses until a platform administrator reviews your case.
          </DialogDescription>
        </DialogHeader>
        {state && "success" in state ? (
          <p role="status" className="text-sm text-emerald-300">{state.success}</p>
        ) : (
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="bookingId" value={bookingId} />
            <div className="space-y-1.5">
              <Label htmlFor="dispute-kind">What is this about?</Label>
              <Select name="kind" defaultValue="attendance">
                <SelectTrigger id="dispute-kind" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="attendance">My attendance wasn't counted</SelectItem>
                  <SelectItem value="content">My content review</SelectItem>
                  <SelectItem value="charge">A charge on my card</SelectItem>
                  <SelectItem value="other">Something else</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dispute-reason">What happened?</Label>
              <Textarea
                id="dispute-reason"
                name="reason"
                rows={4}
                minLength={20}
                maxLength={2000}
                required
                placeholder="Explain what happened with as much detail as you can."
              />
            </div>
            {state && "error" in state ? (
              <p role="alert" className="text-sm font-medium text-red-400">{state.error}</p>
            ) : null}
            <SubmitButton className="w-full" pendingLabel="Opening dispute…">
              Open dispute
            </SubmitButton>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
