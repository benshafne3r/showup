"use client";

import { useActionState } from "react";
import { retryPayoutAction, type ActionState } from "../../actions";
import { SubmitButton } from "@/components/submit-button";

export function RetryPayoutButton({ bookingId }: { bookingId: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(retryPayoutAction, null);

  if (state && "success" in state) {
    return <p role="status" className="mt-2 text-sm text-emerald-300">{state.success}</p>;
  }
  return (
    <form action={formAction} className="mt-2">
      <input type="hidden" name="bookingId" value={bookingId} />
      <SubmitButton size="sm" variant="outline" pendingLabel="Retrying…">
        Retry payout
      </SubmitButton>
      {state && "error" in state ? (
        <p role="alert" className="mt-1 text-sm font-medium text-red-400">{state.error}</p>
      ) : null}
    </form>
  );
}
