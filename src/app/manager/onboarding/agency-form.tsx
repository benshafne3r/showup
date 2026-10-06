"use client";

import { useActionState } from "react";
import { createAgencyAction, updateAgencyAction, type ActionState } from "../actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/submit-button";

/** Create (onboarding) or edit (settings) the management company profile. */
export function AgencyForm({
  defaults,
  submitLabel,
  mode = "create",
  disabled = false,
}: {
  defaults: { name?: string; website?: string | null; city?: string };
  submitLabel: string;
  mode?: "create" | "update";
  disabled?: boolean;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    mode === "create" ? createAgencyAction : updateAgencyAction,
    null,
  );
  return (
    <form action={formAction} className="space-y-4">
      <fieldset disabled={disabled} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="agency-name">Company name</Label>
          <Input
            id="agency-name"
            name="name"
            placeholder="Northside Talent"
            defaultValue={defaults.name}
            autoComplete="organization"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="agency-city">Home city (optional)</Label>
          <Input id="agency-city" name="city" placeholder="Los Angeles" defaultValue={defaults.city} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="agency-website">Website (optional)</Label>
          <Input
            id="agency-website"
            name="website"
            type="url"
            placeholder="https://…"
            defaultValue={defaults.website ?? ""}
          />
        </div>
      </fieldset>
      {state && "error" in state ? (
        <p role="alert" className="text-sm font-medium text-red-400">
          {state.error}
        </p>
      ) : state && "success" in state ? (
        <p role="status" className="text-sm font-medium text-emerald-400">
          {state.success}
        </p>
      ) : null}
      {disabled ? null : (
        <SubmitButton className={mode === "create" ? "w-full" : undefined} pendingLabel="Saving…">
          {submitLabel}
        </SubmitButton>
      )}
    </form>
  );
}
