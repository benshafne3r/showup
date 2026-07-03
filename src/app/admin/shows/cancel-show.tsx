"use client";

import { useActionState } from "react";
import { adminCancelShowAction, type ActionState } from "../actions";
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

export function AdminCancelShow({ showId }: { showId: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(adminCancelShowAction, null);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-red-300">
          Cancel
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel show (admin override)</DialogTitle>
          <DialogDescription>
            Cancels all bookings, releases holds, notifies creators and the company.
          </DialogDescription>
        </DialogHeader>
        {state && "success" in state ? (
          <p role="status" className="text-sm text-emerald-300">{state.success}</p>
        ) : (
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="showId" value={showId} />
            <div className="space-y-1.5">
              <Label htmlFor={`admin-cancel-reason-${showId}`}>Reason</Label>
              <Textarea id={`admin-cancel-reason-${showId}`} name="reason" rows={2} required maxLength={300} />
            </div>
            {state && "error" in state ? (
              <p role="alert" className="text-sm text-red-400">{state.error}</p>
            ) : null}
            <SubmitButton variant="destructive" className="w-full" pendingLabel="Canceling…">
              Cancel show
            </SubmitButton>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
