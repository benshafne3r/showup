"use client";

import { useActionState } from "react";
import { setAutoReleaseAction, type ActionState } from "../actions";
import { Checkbox } from "@/components/ui/checkbox";
import { SubmitButton } from "@/components/submit-button";

export function AutoReleaseForm({ enabled, canManage }: { enabled: boolean; canManage: boolean }) {
  const [state, formAction] = useActionState<ActionState, FormData>(setAutoReleaseAction, null);
  return (
    <form action={formAction} className="space-y-3">
      <label className="flex cursor-pointer items-start gap-3 text-sm">
        <Checkbox name="autoRelease" defaultChecked={enabled} disabled={!canManage} className="mt-0.5" />
        <span>
          Release holds automatically if a creator checks in with a photo and nobody on your team
          reviews it within 48 hours
          <span className="block text-xs text-muted-foreground">
            Location check-ins and &ldquo;Mark attended&rdquo; release instantly either way. Turn this off if you
            want to review every photo yourself.
          </span>
        </span>
      </label>
      {canManage ? (
        <div className="flex items-center gap-3">
          <SubmitButton size="sm" variant="outline" pendingLabel="Saving…">
            Save
          </SubmitButton>
          {state && "success" in state ? (
            <span role="status" className="text-sm text-emerald-400">{state.success}</span>
          ) : state && "error" in state ? (
            <span role="alert" className="text-sm text-red-400">{state.error}</span>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Only an owner or admin can change this.</p>
      )}
    </form>
  );
}
