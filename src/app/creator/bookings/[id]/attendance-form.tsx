"use client";

import { useActionState } from "react";
import { submitAttendanceAction, type ActionState } from "../../actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/submit-button";
import { MapPinCheck } from "lucide-react";

export function AttendanceForm({
  bookingId,
  resubmit,
}: {
  bookingId: string;
  resubmit?: boolean;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(submitAttendanceAction, null);

  if (state && "success" in state) {
    return (
      <p role="status" className="text-sm text-emerald-300">
        {state.success}
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="bookingId" value={bookingId} />
      <p className="text-muted-foreground">
        {resubmit ? "Resubmit proof of attendance." : "You're at the show? Check in with photo proof."}
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="attendance-proof">Photo proof (timestamped photo from the venue)</Label>
        <Input
          id="attendance-proof"
          name="proof"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          required
          aria-describedby="proof-hint"
        />
        <p id="proof-hint" className="text-xs text-muted-foreground">
          Up to 3 images, 10 MB each. A stage shot or venue selfie works great.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="attendance-note">Note (optional)</Label>
        <Textarea id="attendance-note" name="note" rows={2} maxLength={500} placeholder="Anything the team should know" />
      </div>
      {state && "error" in state ? (
        <p role="alert" className="text-sm font-medium text-red-400">
          {state.error}
        </p>
      ) : null}
      <SubmitButton pendingLabel="Checking in…">
        <MapPinCheck className="size-4" aria-hidden />
        Check in now
      </SubmitButton>
    </form>
  );
}
