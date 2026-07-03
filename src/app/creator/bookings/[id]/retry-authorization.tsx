"use client";

import { retryAuthorizationAction } from "../../actions";
import { SubmitButton } from "@/components/submit-button";

export function RetryAuthorizationButton({ bookingId }: { bookingId: string }) {
  return (
    <form action={retryAuthorizationAction}>
      <input type="hidden" name="bookingId" value={bookingId} />
      <SubmitButton size="sm" pendingLabel="Retrying…">
        Retry hold now
      </SubmitButton>
    </form>
  );
}
