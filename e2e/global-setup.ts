import { execSync } from "node:child_process";

/** Reseed the demo database so every e2e run starts from a known state. */
export default function globalSetup() {
  console.log("\nReseeding demo database for e2e run…");
  execSync("npx tsx scripts/seed.ts", { stdio: "inherit" });
}
