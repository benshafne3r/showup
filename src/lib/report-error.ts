/**
 * Send a caught error to Sentry when it's configured (no-op otherwise).
 * Used by error boundaries, whose errors never reach the global handlers.
 */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  const dsn =
    typeof window === "undefined" ? process.env.SENTRY_DSN : process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  void import("@sentry/nextjs").then((Sentry) =>
    error instanceof Error
      ? Sentry.captureException(error, context ? { extra: context } : undefined)
      : Sentry.captureMessage(String(error), { level: "error", extra: context }),
  );
}
