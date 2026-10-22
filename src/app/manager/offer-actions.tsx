"use client";

import Link from "next/link";
import { useActionState } from "react";
import { toast } from "sonner";
import { acceptForCreatorAction, passForCreatorAction, type ActionState } from "./actions";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmActionButton } from "@/components/confirm-action-button";

/**
 * Accept (hold on the agency's card) or pass, for a booking waiting on the
 * agency. Without an agency card, points to Payments instead.
 */
export function OfferActions({
  bookingId,
  creatorName,
  hold,
  card,
}: {
  bookingId: string;
  creatorName: string;
  /** "$10.00" */
  hold: string;
  /** "Visa •••• 4242", or null when the agency has no card yet */
  card: string | null;
}) {
  // Toast from inside the action: on success this row re-renders away (the
  // offer is no longer waiting), so an inline message would never show.
  const [state, formAction] = useActionState<ActionState, FormData>(async (prev, fd) => {
    const result = await acceptForCreatorAction(prev, fd);
    if (result && "success" in result) toast.success(`${creatorName}: ${result.success}`);
    return result;
  }, null);

  if (state && "success" in state) {
    return (
      <p role="status" className="text-sm font-medium text-emerald-300">
        {state.success}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {card ? (
        <form action={formAction} className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <input type="hidden" name="bookingId" value={bookingId} />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" name="agreeTerms" required className="accent-primary" />
            Put a {hold} hold on {card}
          </label>
          <SubmitButton size="sm" pendingLabel="Accepting…">
            Accept for {creatorName.split(" ")[0]}
          </SubmitButton>
        </form>
      ) : (
        <p className="text-xs text-amber-300">
          <Link href="/manager/payments" className="underline underline-offset-2">
            Add a card in Payments
          </Link>{" "}
          to accept. Holds for your creators go on it.
        </p>
      )}
      <ConfirmActionButton
        action={passForCreatorAction}
        fields={{ bookingId }}
        triggerLabel="Pass"
        title={`Pass for ${creatorName}?`}
        description="The ticket goes back to the label and they're told your creator can't make it."
        confirmLabel="Pass"
        cancelLabel="Keep it"
      />
      {state && "error" in state ? (
        <p role="alert" className="text-sm font-medium text-red-400">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
