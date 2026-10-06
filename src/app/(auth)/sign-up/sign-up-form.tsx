"use client";

import { useActionState } from "react";
import { signUp } from "../actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/submit-button";

export function SignUpForm({
  next,
  invite,
}: {
  next?: string;
  /** Present when signing up from an invite link (`/join/<token>`). */
  invite?: { token: string; email: string; emailLocked: boolean; fullName: string };
}) {
  const [state, formAction] = useActionState(signUp, null);

  if (state && "pending" in state) {
    return (
      <p
        role="status"
        className="rounded-lg border border-primary/30 bg-primary/10 p-4 text-sm"
      >
        Almost there! We sent a confirmation link to{" "}
        <span className="font-medium">{state.pending}</span>. Click it to verify your email and
        finish setting up your account.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {invite ? <input type="hidden" name="invite" value={invite.token} /> : null}

      <div className="space-y-2">
        <Label htmlFor="fullName">Full name</Label>
        <Input
          id="fullName"
          name="fullName"
          autoComplete="name"
          defaultValue={invite?.fullName}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={invite?.email}
          readOnly={invite?.emailLocked}
          aria-describedby={invite?.emailLocked ? "email-hint" : undefined}
          required
        />
        {invite?.emailLocked ? (
          <p id="email-hint" className="text-xs text-muted-foreground">
            This invite was sent to this address.
          </p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          aria-describedby="password-hint"
        />
        <p id="password-hint" className="text-xs text-muted-foreground">
          At least 8 characters.
        </p>
      </div>
      {state?.error ? (
        <p role="alert" className="text-sm font-medium text-red-400">
          {state.error}
        </p>
      ) : null}
      <SubmitButton className="w-full" pendingLabel="Creating account…">
        Create account
      </SubmitButton>
    </form>
  );
}
