"use client";

import { useActionState } from "react";
import { resolveNoShowAction, type ActionState } from "../../actions";
import { formatCents } from "@/lib/money";
import { SubmitButton } from "@/components/submit-button";

export function NoShowActions({
  bookingId,
  holdActive,
  holdCents,
}: {
  bookingId: string;
  holdActive: boolean;
  holdCents: number;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(resolveNoShowAction, null);

  if (state && "success" in state) {
    return (
      <p role="status" className="text-sm font-medium text-emerald-300">
        {state.success}
      </p>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
      <p className="text-sm font-medium text-amber-300">
        The show has passed without verified attendance.
      </p>
      <div className="flex flex-wrap gap-2">
        <form action={formAction}>
          <input type="hidden" name="bookingId" value={bookingId} />
          <input type="hidden" name="noShowAction" value="capture" />
          <SubmitButton variant="destructive" size="sm" disabled={!holdActive} pendingLabel="Charging…">
            Charge the {formatCents(holdCents)} hold
          </SubmitButton>
        </form>
        <form action={formAction}>
          <input type="hidden" name="bookingId" value={bookingId} />
          <input type="hidden" name="noShowAction" value="excuse" />
          <SubmitButton variant="outline" size="sm" pendingLabel="Excusing…">
            Excuse (release without charge)
          </SubmitButton>
        </form>
      </div>
      {!holdActive ? (
        <p className="text-xs text-muted-foreground">
          No active hold on this booking — only "excuse" is available.
        </p>
      ) : null}
      {state && "error" in state ? (
        <p role="alert" className="text-sm font-medium text-red-400">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
