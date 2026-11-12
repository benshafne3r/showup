/**
 * Browser error tracking (Sentry). Only loads the SDK when a DSN is configured
 * (NEXT_PUBLIC_SENTRY_DSN is inlined at build time, so set it before deploying).
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  void import("@sentry/nextjs").then((Sentry) =>
    Sentry.init({
      dsn,
      tracesSampleRate: 0,
      // While the owner is viewing as someone, changes are refused on purpose
      // (a 403 the client reports as an unexpected response): not a bug.
      beforeSend(event) {
        const viewing = document.cookie.split("; ").includes("showup_viewing=1");
        const refused = event.exception?.values?.some((v) => v.value?.includes("An unexpected response was received from the server"));
        return viewing && refused ? null : event;
      },
    }),
  );
}
