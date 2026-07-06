import "server-only";

import { ZodError } from "zod";
import { AuthError } from "@/server/auth/guards";
import { RateLimitError } from "@/server/services/rate-limit";
import { log, errorFields } from "@/server/log";

export type ActionState = { error: string } | { success: string } | null;

/**
 * Convert a thrown error into a user-safe action result.
 *
 * - Expected domain errors (auth, rate-limit, input validation) carry
 *   messages that are safe and useful to show the user.
 * - Anything else is an unexpected failure: we log it server-side (so it is
 *   actually visible in production) and return a generic message, so internal
 *   details — DB structure, provider errors, stack traces — never reach the
 *   browser.
 *
 * `context` is a short label (e.g. the action name) attached to the log line.
 */
export function toActionError(err: unknown, context?: string): { error: string } {
  if (err instanceof AuthError || err instanceof RateLimitError) {
    return { error: err.message };
  }
  if (err instanceof ZodError) {
    return { error: err.issues[0]?.message ?? "Please check your input and try again." };
  }
  log.error("Unhandled action error", { context, ...errorFields(err) });
  return { error: "Something went wrong. Please try again." };
}
