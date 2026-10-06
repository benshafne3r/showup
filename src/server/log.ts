import "server-only";

import { reportError } from "@/lib/report-error";

/**
 * Minimal structured logger. Emits one JSON line per event so any log
 * aggregator can filter and search by field. Use this instead of bare
 * `console.*` in server code so production failures are actually greppable.
 */

type Level = "info" | "warn" | "error";
type Fields = Record<string, unknown>;

function emit(level: Level, msg: string, fields?: Fields) {
  const line = JSON.stringify({
    level,
    msg,
    time: new Date().toISOString(),
    ...fields,
  });
  if (level === "error") {
    console.error(line);
    // Every logged error also goes to Sentry (when SENTRY_DSN is set).
    const err = fields?.stack
      ? Object.assign(new Error(String(fields.message ?? msg)), { stack: String(fields.stack) })
      : msg;
    reportError(err, { msg, ...fields });
  } else if (level === "warn") console.warn(line);
  else console.info(line);
}

export const log = {
  info: (msg: string, fields?: Fields) => emit("info", msg, fields),
  warn: (msg: string, fields?: Fields) => emit("warn", msg, fields),
  error: (msg: string, fields?: Fields) => emit("error", msg, fields),
};

/** Normalize an unknown thrown value into loggable message + stack fields. */
export function errorFields(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) return { message: err.message, stack: err.stack };
  return { message: String(err) };
}
