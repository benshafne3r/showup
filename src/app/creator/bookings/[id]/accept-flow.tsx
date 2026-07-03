"use client";

import { useActionState, useEffect, useState } from "react";
import {
  acceptBookingAction,
  addPaymentMethod,
  type ActionState,
} from "../../actions";
import { formatCents } from "@/lib/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/submit-button";
import { timeUntil, isDeadlinePast } from "@/lib/dates";
import { CreditCard, ShieldCheck, Timer } from "lucide-react";

/**
 * The 3-step acceptance flow: review terms (rendered by the parent page's
 * TermsBreakdown) → verify a payment method → explicit consent → confirm.
 */
export function AcceptFlow({
  bookingId,
  deadline,
  hasVerifiedCard,
  cardLabel,
  holdCents,
}: {
  bookingId: string;
  deadline: string;
  hasVerifiedCard: boolean;
  cardLabel: string | null;
  holdCents: number;
}) {
  const [cardState, cardAction] = useActionState<ActionState, FormData>(addPaymentMethod, null);
  const [acceptState, acceptAction] = useActionState<ActionState, FormData>(acceptBookingAction, null);
  const [agreed, setAgreed] = useState(false);
  const [, forceTick] = useState(0);

  // Refresh the countdown each minute.
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const expired = isDeadlinePast(deadline);
  const cardSaved = hasVerifiedCard || (cardState !== null && "success" in cardState);

  return (
    <Card className="border-amber-500/40">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span>Secure your spot</span>
          <span className="flex items-center gap-1.5 text-sm font-medium text-amber-300">
            <Timer className="size-4" aria-hidden />
            {expired ? "Window closed" : `${timeUntil(deadline)} left`}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        <ol className="space-y-1 text-muted-foreground">
          <li>1. Review the ticket &amp; hold details (right side of this page).</li>
          <li>2. Add a payment method for the temporary hold.</li>
          <li>3. Agree to the hold terms and confirm.</li>
        </ol>

        {/* Step 2: payment method */}
        <div className="rounded-lg border p-4">
          <p className="flex items-center gap-2 font-medium">
            <CreditCard className="size-4 text-primary" aria-hidden />
            Payment method
          </p>
          {cardSaved ? (
            <p className="mt-2 text-emerald-300">
              {cardLabel ?? "Card"} verified ✓ — it will only be used for the temporary hold.
            </p>
          ) : (
            <form action={cardAction} className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="cardNumber">Card number</Label>
                <Input
                  id="cardNumber"
                  name="cardNumber"
                  inputMode="numeric"
                  autoComplete="cc-number"
                  placeholder="4242 4242 4242 4242"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="expMonth">Exp. month</Label>
                  <Input id="expMonth" name="expMonth" inputMode="numeric" placeholder="12" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="expYear">Exp. year</Label>
                  <Input id="expYear" name="expYear" inputMode="numeric" placeholder="2030" required />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cvc">CVC</Label>
                <Input id="cvc" name="cvc" inputMode="numeric" autoComplete="cc-csc" placeholder="123" required />
              </div>
              {cardState && "error" in cardState ? (
                <p role="alert" className="text-sm font-medium text-red-400 sm:col-span-2">
                  {cardState.error}
                </p>
              ) : null}
              <div className="sm:col-span-2">
                <SubmitButton variant="secondary" pendingLabel="Verifying card…">
                  Verify &amp; save card
                </SubmitButton>
              </div>
            </form>
          )}
        </div>

        {/* Step 3: consent + confirm */}
        <form action={acceptAction} className="space-y-4">
          <input type="hidden" name="bookingId" value={bookingId} />
          <label className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <Checkbox
              name="agreeTerms"
              checked={agreed}
              onCheckedChange={(checked) => setAgreed(checked === true)}
              aria-describedby="hold-terms"
              className="mt-0.5"
            />
            <span id="hold-terms" className="text-sm">
              I agree to a <strong>temporary hold of {formatCents(holdCents)}</strong> on my card,
              placed a few days before the show and covering every ticket I requested (including
              my +1 if any). I understand that <strong>attending the show releases the hold in
              full</strong>, that no-shows may be charged, and that the hold is not part of my
              earnings.
            </span>
          </label>
          {acceptState && "error" in acceptState ? (
            <p role="alert" className="text-sm font-medium text-red-400">
              {acceptState.error}
            </p>
          ) : null}
          <SubmitButton
            size="lg"
            className="w-full"
            disabled={!agreed || !cardSaved || expired}
            pendingLabel="Confirming…"
          >
            <ShieldCheck className="size-4" aria-hidden />
            Confirm my booking
          </SubmitButton>
          {!cardSaved ? (
            <p className="text-center text-xs text-muted-foreground">
              Verify a payment method first.
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
