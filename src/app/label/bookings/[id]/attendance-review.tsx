"use client";

import { useActionState, useState } from "react";
import {
  approveAttendanceAction,
  rejectAttendanceAction,
  type ActionState,
} from "../../actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/submit-button";
import { Check, X } from "lucide-react";

export function AttendanceReview({ bookingId }: { bookingId: string }) {
  const [approveState, approveAction] = useActionState<ActionState, FormData>(approveAttendanceAction, null);
  const [rejectState, rejectAction] = useActionState<ActionState, FormData>(rejectAttendanceAction, null);
  const [rejecting, setRejecting] = useState(false);

  const success =
    (approveState && "success" in approveState && approveState.success) ||
    (rejectState && "success" in rejectState && rejectState.success);
  if (success) {
    return (
      <p role="status" className="text-sm font-medium text-emerald-300">
        {success}
      </p>
    );
  }
  const error =
    (approveState && "error" in approveState && approveState.error) ||
    (rejectState && "error" in rejectState && rejectState.error);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <form action={approveAction}>
          <input type="hidden" name="bookingId" value={bookingId} />
          <SubmitButton pendingLabel="Approving…">
            <Check className="size-4" aria-hidden /> Verify attendance &amp; release hold
          </SubmitButton>
        </form>
        <Button type="button" variant="outline" onClick={() => setRejecting((v) => !v)}>
          <X className="size-4" aria-hidden /> Reject proof
        </Button>
      </div>
      {rejecting ? (
        <form action={rejectAction} className="space-y-2 rounded-lg border border-red-500/30 p-3">
          <input type="hidden" name="bookingId" value={bookingId} />
          <Label htmlFor={`reject-note-${bookingId}`}>Why is the proof being rejected?</Label>
          <Textarea
            id={`reject-note-${bookingId}`}
            name="reviewNote"
            rows={2}
            minLength={5}
            maxLength={500}
            required
            placeholder="Photo doesn't show the venue / wrong date / …"
          />
          <SubmitButton variant="destructive" size="sm" pendingLabel="Rejecting…">
            Reject &amp; move to no-show review
          </SubmitButton>
        </form>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm font-medium text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
