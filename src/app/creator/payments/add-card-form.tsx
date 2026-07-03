"use client";

import { useActionState, useState } from "react";
import { addPaymentMethod, type ActionState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/submit-button";

export function AddCardForm({ hasCard }: { hasCard: boolean }) {
  const [state, formAction] = useActionState<ActionState, FormData>(addPaymentMethod, null);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        {hasCard ? "Replace card" : "Add a card"}
      </Button>
    );
  }

  return (
    <form action={formAction} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="pm-cardNumber">Card number</Label>
        <Input
          id="pm-cardNumber"
          name="cardNumber"
          inputMode="numeric"
          autoComplete="cc-number"
          placeholder="4242 4242 4242 4242"
          required
        />
        <p className="text-xs text-muted-foreground">
          Test mode: 4242 4242 4242 4242 verifies · 4000 0000 0000 0002 declines.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="pm-expMonth">Exp. month</Label>
          <Input id="pm-expMonth" name="expMonth" inputMode="numeric" placeholder="12" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pm-expYear">Exp. year</Label>
          <Input id="pm-expYear" name="expYear" inputMode="numeric" placeholder="2030" required />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pm-cvc">CVC</Label>
        <Input id="pm-cvc" name="cvc" inputMode="numeric" autoComplete="cc-csc" placeholder="123" required />
      </div>
      {state && "error" in state ? (
        <p role="alert" className="text-sm font-medium text-red-400 sm:col-span-2">
          {state.error}
        </p>
      ) : null}
      {state && "success" in state ? (
        <p role="status" className="text-sm font-medium text-emerald-400 sm:col-span-2">
          {state.success}
        </p>
      ) : null}
      <div className="flex gap-2 sm:col-span-2">
        <SubmitButton pendingLabel="Verifying…">Verify &amp; save</SubmitButton>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
