"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { reviewContentAction, type ActionState } from "../../actions";
import { formatCents } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/submit-button";
import { Check, RotateCcw, X } from "lucide-react";

export function ContentReview({
  bookingId,
  submissionId,
  paymentCents,
  alreadyPaid,
  cardLast4,
  lastChargeError,
}: {
  bookingId: string;
  submissionId: string;
  paymentCents: number;
  /** The content fee is already charged (or covered), so approving charges nothing. */
  alreadyPaid: boolean;
  /** The label's card for content fees, if it has one. */
  cardLast4: string | null;
  /** Why the last charge failed, when it did. */
  lastChargeError: string | null;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(reviewContentAction, null);
  const [mode, setMode] = useState<"approved" | "revision_requested" | "rejected" | null>(null);

  if (state && "success" in state) {
    return (
      <p role="status" className="text-sm font-medium text-emerald-300">
        {state.success}
      </p>
    );
  }

  const charges = paymentCents > 0 && !alreadyPaid;
  return (
    <div className="space-y-2 border-t pt-3">
      {charges ? (
        cardLast4 ? (
          <p className="text-xs text-muted-foreground">
            {`Approving charges ${formatCents(paymentCents)} to your card ending ${cardLast4} and pays the creator.`}
          </p>
        ) : (
          <p className="text-xs text-amber-300">
            {`Approving charges ${formatCents(paymentCents)} for the creator's payment. `}
            <Link href="/label/payments" className="underline underline-offset-2">
              Add a card in Payments
            </Link>{" "}
            first.
          </p>
        )
      ) : null}
      {lastChargeError ? (
        <p className="text-xs text-red-400">{`Last charge didn't go through: ${lastChargeError}`}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <form action={formAction}>
          <input type="hidden" name="bookingId" value={bookingId} />
          <input type="hidden" name="submissionId" value={submissionId} />
          <input type="hidden" name="decision" value="approved" />
          <SubmitButton size="sm" pendingLabel="Approving…">
            <Check className="size-4" aria-hidden />
            Approve{paymentCents > 0 ? ` & pay ${formatCents(paymentCents)}` : ""}
          </SubmitButton>
        </form>
        <Button type="button" variant="outline" size="sm" onClick={() => setMode("revision_requested")}>
          <RotateCcw className="size-4" aria-hidden /> Request revision
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setMode("rejected")}>
          <X className="size-4" aria-hidden /> Reject
        </Button>
      </div>
      {mode && mode !== "approved" ? (
        <form action={formAction} className="space-y-2 rounded-lg border p-3">
          <input type="hidden" name="bookingId" value={bookingId} />
          <input type="hidden" name="submissionId" value={submissionId} />
          <input type="hidden" name="decision" value={mode} />
          <Label htmlFor={`content-note-${submissionId}`}>
            Note to the creator ({mode === "revision_requested" ? "what to change" : "why it's rejected"})
          </Label>
          <Textarea
            id={`content-note-${submissionId}`}
            name="reviewNote"
            rows={2}
            minLength={5}
            maxLength={500}
            required
          />
          <SubmitButton size="sm" variant={mode === "rejected" ? "destructive" : "default"} pendingLabel="Sending…">
            {mode === "revision_requested" ? "Send revision request" : "Reject content"}
          </SubmitButton>
        </form>
      ) : null}
      {state && "error" in state ? (
        <p role="alert" className="text-sm font-medium text-red-400">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
