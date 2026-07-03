"use client";

import { useActionState } from "react";
import { resolveDisputeAction, type ActionState } from "../actions";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/submit-button";

const RESOLUTIONS = [
  { value: "release_hold", label: "Release the hold (creator wins attendance/charge)" },
  { value: "capture_hold", label: "Capture the hold (label wins no-show)" },
  { value: "pay_creator", label: "Approve content & pay creator" },
  { value: "deny_payment", label: "Deny the creator payment" },
  { value: "no_action", label: "No money action — notes only" },
];

export function ResolveDisputeForm({ disputeId, kind }: { disputeId: string; kind: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(resolveDisputeAction, null);

  if (state && "success" in state) {
    return (
      <p role="status" className="self-start rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
        {state.success}
      </p>
    );
  }

  const defaultResolution =
    kind === "content" ? "pay_creator" : kind === "charge" ? "release_hold" : "release_hold";

  return (
    <form action={formAction} className="space-y-3 self-start rounded-lg border p-4">
      <input type="hidden" name="disputeId" value={disputeId} />
      <p className="text-sm font-medium">Resolve</p>
      <div className="space-y-1.5">
        <Label htmlFor={`resolution-${disputeId}`}>Outcome</Label>
        <Select name="resolution" defaultValue={defaultResolution}>
          <SelectTrigger id={`resolution-${disputeId}`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RESOLUTIONS.map((resolution) => (
              <SelectItem key={resolution.value} value={resolution.value}>
                {resolution.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`notes-${disputeId}`}>Resolution notes (sent to both parties)</Label>
        <Textarea id={`notes-${disputeId}`} name="notes" rows={3} minLength={5} maxLength={2000} required />
      </div>
      {state && "error" in state ? (
        <p role="alert" className="text-sm font-medium text-red-400">{state.error}</p>
      ) : null}
      <SubmitButton className="w-full" pendingLabel="Resolving…">
        Resolve dispute
      </SubmitButton>
    </form>
  );
}
