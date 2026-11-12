import type { Instrumentation } from "next";

/**
 * Error tracking (Sentry). Inert until SENTRY_DSN is set, so local dev, CI
 * and e2e never report anything.
 */
export async function register() {
  if (!process.env.SENTRY_DSN) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.RAILWAY_ENVIRONMENT_NAME ?? process.env.NODE_ENV,
    release: process.env.RAILWAY_GIT_COMMIT_SHA,
    tracesSampleRate: 0, // errors only, no performance tracing
  });
}

/** Server errors Next.js catches while rendering / handling requests. */
export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (!process.env.SENTRY_DSN) return;
  // Bots POST made-up server-action ids to the marketing pages (which have no
  // forms); Next rejects them. Not a bug, so not an alert. App pages still
  // report it, since there it can mean a real user on an old deploy.
  const [error, , context] = args;
  const message = error instanceof Error ? error.message : "";
  if (message.startsWith("Failed to find Server Action") && context.routePath.includes("/(marketing)")) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
};
