"use client";

import { type FormEvent, useState, useTransition } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import type { ActionState } from "../actions";
import { Button } from "@/components/ui/button";

// Stripe.js must be loaded from Stripe's domain (a PCI requirement); loading it
// here means card data goes browser → Stripe directly, never through our server.
const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;
const testMode = publishableKey.startsWith("pk_test_");

type StartSetup = () => Promise<{ clientSecret: string } | { error: string }>;
type FinishSetup = (setupIntentId: string) => Promise<ActionState>;

/**
 * Save a card with Stripe's card setup: the card details go from the browser
 * to Stripe, the bank can ask the cardholder to confirm (once, now), and
 * later holds and charges run without them. `start` / `finish` are the
 * owner's server actions (a creator's own card, an agency's, or a label's).
 */
export function StripeCardForm({
  hasCard,
  start,
  finish,
}: {
  hasCard: boolean;
  start: StartSetup;
  finish: FinishSetup;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        {hasCard ? "Replace card" : "Add a card"}
      </Button>
    );
  }
  if (!stripePromise) {
    return <p className="text-sm font-medium text-red-400">Stripe is not configured.</p>;
  }
  return (
    <Elements stripe={stripePromise}>
      <CardFields start={start} finish={finish} onCancel={() => setOpen(false)} />
    </Elements>
  );
}

function CardFields({ start, finish, onCancel }: { start: StartSetup; finish: FinishSetup; onCancel: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [pending, startSaving] = useTransition();
  const [state, setState] = useState<ActionState>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    const card = elements.getElement(CardElement);
    if (!card) return;

    setState(null);
    startSaving(async () => {
      const setup = await start();
      if ("error" in setup) {
        setState({ error: setup.error });
        return;
      }
      // Stripe shows the bank's check (3D Secure) itself when the bank asks for one.
      const { setupIntent, error } = await stripe.confirmCardSetup(setup.clientSecret, { payment_method: { card } });
      if (error || !setupIntent) {
        setState({ error: error?.message ?? "The card couldn't be confirmed. Try again." });
        return;
      }
      setState(await finish(setupIntent.id));
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid max-w-md gap-3 rounded-lg border p-4">
      <div className="rounded-md border bg-background px-3 py-2.5">
        <CardElement
          options={{
            style: {
              base: {
                color: "#fafafa",
                fontSize: "14px",
                "::placeholder": { color: "#71717a" },
              },
              invalid: { color: "#f87171" },
            },
          }}
        />
      </div>
      {testMode ? (
        <p className="text-xs text-muted-foreground">
          Test mode: card 4242 4242 4242 4242 (or 4000 0025 0000 3155 to see the bank check), any future
          expiry, CVC and ZIP.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Your bank may ask you to confirm the card. That&apos;s a one-time check.</p>
      )}
      {state && "error" in state ? (
        <p role="alert" className="text-sm font-medium text-red-400">
          {state.error}
        </p>
      ) : null}
      {state && "success" in state ? (
        <p role="status" className="text-sm font-medium text-emerald-400">
          {state.success}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={!stripe || pending}>
          {pending ? "Verifying…" : "Verify & save"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
