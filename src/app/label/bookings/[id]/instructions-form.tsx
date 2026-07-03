"use client";

import { useActionState } from "react";
import { sendInstructionsAction, type ActionState } from "../../actions";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/submit-button";
import { Send } from "lucide-react";

export function InstructionsForm({ bookingId, existing }: { bookingId: string; existing: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(sendInstructionsAction, null);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="bookingId" value={bookingId} />
      <div className="space-y-1.5">
        <Label htmlFor={`instructions-${bookingId}`}>
          {existing ? "Update instructions" : "Send ticket instructions"}
        </Label>
        <Textarea
          id={`instructions-${bookingId}`}
          name="instructions"
          rows={3}
          maxLength={2000}
          defaultValue={existing}
          placeholder="Guest list under their full name, doors at 7pm, west entrance, bring photo ID…"
          required
        />
      </div>
      {state && "error" in state ? (
        <p role="alert" className="text-sm font-medium text-red-400">{state.error}</p>
      ) : null}
      {state && "success" in state ? (
        <p role="status" className="text-sm font-medium text-emerald-400">{state.success}</p>
      ) : null}
      <SubmitButton size="sm" pendingLabel="Sending…">
        <Send className="size-4" aria-hidden /> {existing ? "Resend" : "Send"} instructions
      </SubmitButton>
    </form>
  );
}
