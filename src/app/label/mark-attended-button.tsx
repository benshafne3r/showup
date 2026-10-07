"use client";

import { useActionState } from "react";
import { markAttendedAction, type ActionState } from "./actions";
import { SubmitButton } from "@/components/submit-button";
import { CheckCircle2 } from "lucide-react";

/** One tap: the creator was at the show → attendance approved, hold released. */
export function MarkAttendedButton({ bookingId, creatorName }: { bookingId: string; creatorName?: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(markAttendedAction, null);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="bookingId" value={bookingId} />
      <SubmitButton
        size="sm"
        variant="outline"
        pendingLabel="Marking…"
        aria-label={creatorName ? `Mark ${creatorName} attended` : "Mark attended"}
      >
        <CheckCircle2 className="size-3.5" aria-hidden /> Mark attended
      </SubmitButton>
      {state && "error" in state ? (
        <span role="alert" className="text-xs font-medium text-red-400">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
