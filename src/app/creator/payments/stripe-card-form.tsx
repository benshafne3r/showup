"use client";

import { type FormEvent, useState, useTransition } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { addPaymentMethodToken, type ActionState } from "../actions";
import { Button } from "@/components/ui/button";

// Stripe.js must be loaded from Stripe's domain (a PCI requirement); loading it
// here means card data goes browser → Stripe directly, never through our server.
const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

export function StripeCardForm({ hasCard }: { hasCard: boolean }) {
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
      <CardFields onCancel={() => setOpen(false)} />
    </Elements>
  );
}

function CardFields({ onCancel }: { onCancel: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    const card = elements.getElement(CardElement);
    if (!card) return;

    const { paymentMethod, error } = await stripe.createPaymentMethod({ type: "card", card });
    if (error || !paymentMethod) {
      setState({ error: error?.message ?? "Could not read the card details." });
      return;
    }
    start(async () => {
      const fd = new FormData();
      fd.set("paymentMethodId", paymentMethod.id);
      setState(await addPaymentMethodToken(null, fd));
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
      <p className="text-xs text-muted-foreground">
        Test mode: card 4242 4242 4242 4242, any future expiry, any CVC and ZIP.
      </p>
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
