"use client";

import { useActionState } from "react";
import {
  adminCaptureHoldAction,
  adminPayoutAction,
  adminReleaseHoldAction,
  type ActionState,
} from "../actions";
import { SubmitButton } from "@/components/submit-button";

export function HoldActions({ authorizationId }: { authorizationId: string }) {
  const [releaseState, releaseAction] = useActionState<ActionState, FormData>(adminReleaseHoldAction, null);
  const [captureState, captureAction] = useActionState<ActionState, FormData>(adminCaptureHoldAction, null);

  const message =
    (releaseState && ("success" in releaseState ? releaseState.success : releaseState.error)) ||
    (captureState && ("success" in captureState ? captureState.success : captureState.error));

  return (
    <div className="flex flex-wrap items-center gap-1">
      <form action={releaseAction}>
        <input type="hidden" name="authorizationId" value={authorizationId} />
        <SubmitButton variant="ghost" size="sm" pendingLabel="…">Release</SubmitButton>
      </form>
      <form action={captureAction}>
        <input type="hidden" name="authorizationId" value={authorizationId} />
        <SubmitButton variant="ghost" size="sm" className="text-red-300" pendingLabel="…">
          Capture
        </SubmitButton>
      </form>
      {message ? <span className="text-xs text-muted-foreground">{message}</span> : null}
    </div>
  );
}

export function PayoutActions({ bookingId }: { bookingId: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(adminPayoutAction, null);
  return (
    <form action={formAction} className="inline-flex items-center gap-1">
      <input type="hidden" name="bookingId" value={bookingId} />
      <SubmitButton variant="ghost" size="sm" pendingLabel="…">Pay now</SubmitButton>
      {state ? (
        <span className="text-xs text-muted-foreground">
          {"success" in state ? state.success : state.error}
        </span>
      ) : null}
    </form>
  );
}
