"use client";

import { useActionState } from "react";
import { requestPasswordReset } from "../actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/submit-button";

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(requestPasswordReset, null);

  if (state && "sent" in state) {
    return (
      <p
        role="status"
        className="rounded-lg border border-primary/30 bg-primary/10 p-4 text-sm"
      >
        If an account exists for that email, a password reset link is on its way. Check your
        inbox (and spam), then follow the link to choose a new password.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      {state?.error ? (
        <p role="alert" className="text-sm font-medium text-red-400">
          {state.error}
        </p>
      ) : null}
      <SubmitButton className="w-full" pendingLabel="Sending…">
        Send reset link
      </SubmitButton>
    </form>
  );
}
