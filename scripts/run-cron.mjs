/**
 * Trigger the scheduled-job endpoint:  npm run cron
 *
 * Reads CRON_SECRET + app URL from the process environment (Railway/CI),
 * falling back to a local .env.local file for `npm run cron` during dev.
 * Suitable as a Railway cron service (schedule it every 10 min).
 */
import { readFileSync } from "node:fs";

function loadDotEnvLocal() {
  try {
    return Object.fromEntries(
      readFileSync(".env.local", "utf8")
        .split("\n")
        .filter((line) => line.includes("=") && !line.startsWith("#"))
        .map((line) => {
          const index = line.indexOf("=");
          return [line.slice(0, index), line.slice(index + 1).replace(/^"|"$/g, "")];
        }),
    );
  } catch {
    return {};
  }
}

const fileEnv = loadDotEnvLocal();
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? fileEnv.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const cronSecret = process.env.CRON_SECRET ?? fileEnv.CRON_SECRET;

if (!cronSecret) {
  console.error("CRON_SECRET is not set");
  process.exit(1);
}

const response = await fetch(`${appUrl}/api/cron/run`, {
  method: "POST",
  headers: { "x-cron-secret": cronSecret },
});
console.log(response.status, await response.text());
if (!response.ok) process.exit(1);
