/**
 * Browser error tracking (Sentry). Only loads the SDK when a DSN is configured
 * (NEXT_PUBLIC_SENTRY_DSN is inlined at build time, so set it before deploying).
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  void import("@sentry/nextjs").then((Sentry) =>
    Sentry.init({ dsn, tracesSampleRate: 0 }),
  );
}
