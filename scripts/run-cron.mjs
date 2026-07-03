/**
 * Trigger the scheduled-job endpoint locally:  npm run cron
 * (Reads CRON_SECRET + app URL from .env.local.)
 */
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((line) => line.includes("=") && !line.startsWith("#"))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1).replace(/^"|"$/g, "")];
    }),
);

const url = `${env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/cron/run`;
const response = await fetch(url, {
  method: "POST",
  headers: { "x-cron-secret": env.CRON_SECRET },
});
console.log(response.status, await response.text());
