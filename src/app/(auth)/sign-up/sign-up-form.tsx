"use client";

import { useActionState, useState } from "react";
import { signUp } from "../actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/submit-button";
import { cn } from "@/lib/utils";
import { Mic2, Sparkles } from "lucide-react";

export function SignUpForm({ defaultRole }: { defaultRole: "creator" | "label" }) {
  const [state, formAction] = useActionState(signUp, null);
  const [role, setRole] = useState<"creator" | "label">(defaultRole);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">I am a…</legend>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Account type">
          {(
            [
              { value: "creator", label: "Creator", desc: "Get free show access", icon: Sparkles },
              { value: "label", label: "Label / Manager", desc: "Book creators for shows", icon: Mic2 },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={role === option.value}
              onClick={() => setRole(option.value)}
              className={cn(
                "flex flex-col items-start gap-1 rounded-lg border p-3 text-left text-sm transition-colors",
                role === option.value
                  ? "border-primary bg-primary/10"
                  : "hover:border-muted-foreground/40",
              )}
            >
              <option.icon className="size-4 text-primary" aria-hidden />
              <span className="font-medium">{option.label}</span>
              <span className="text-xs text-muted-foreground">{option.desc}</span>
            </button>
          ))}
        </div>
        <input type="hidden" name="role" value={role} />
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="fullName">Full name</Label>
        <Input id="fullName" name="fullName" autoComplete="name" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
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
