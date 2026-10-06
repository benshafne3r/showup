/**
 * Private sign-up links for labels and management companies. Public sign-up
 * only makes creators; a partner account needs one of these single-use links.
 *
 *   npm run invite -- label   --org "Atlantic Records" [--email a@b.com] [--days 7] [--note "…"] [--prod]
 *   npm run invite -- manager --org "Northside Talent" [--email a@b.com] [--days 7] [--note "…"] [--prod]
 *   npm run invite -- list   [--prod]
 *   npm run invite -- revoke <invite-id> [--prod]
 *
 * --prod targets the live project (.env.production.local) and prints
 * https://app.showuptickets.com links; otherwise .env.local (local dev).
 * --email locks the link to that address. Only the token's hash is stored —
 * the link is printed once, so copy it then.
 */
import { createHash, randomBytes } from "node:crypto";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const prod = args.includes("--prod");
config({ path: prod ? ".env.production.local" : ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(`Missing Supabase URL / service key in ${prod ? ".env.production.local" : ".env.local"}`);
  process.exit(1);
}
const base = flag("base") ?? (prod ? "https://app.showuptickets.com" : process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");
const db = createClient<Database>(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function create(kind: "label" | "manager") {
  const org = flag("org") ?? "";
  const email = flag("email")?.trim().toLowerCase() ?? null;
  const days = Number(flag("days") ?? 7);
  if (!Number.isFinite(days) || days < 1 || days > 60) throw new Error("--days must be 1–60");
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("--email looks invalid");

  const token = randomBytes(24).toString("base64url");
  const { data, error } = await db
    .from("partner_invites")
    .insert({
      kind,
      email,
      org_name: org,
      note: flag("note") ?? "",
      token_hash: createHash("sha256").update(token).digest("hex"),
      expires_at: new Date(Date.now() + days * 86_400_000).toISOString(),
    })
    .select("id, expires_at")
    .single();
  if (error) throw new Error(error.message);

  console.log(`\n${kind === "label" ? "Label" : "Management"} invite${org ? ` for ${org}` : ""}${email ? ` (${email} only)` : ""}`);
  console.log(`Single use · expires ${new Date(data.expires_at).toLocaleString()} · id ${data.id}\n`);
  console.log(`${base}/join/${token}\n`);
}

async function list() {
  const { data, error } = await db
    .from("partner_invites")
    .select("id, kind, org_name, email, note, created_at, expires_at, used_at, revoked_at, users:used_by(email)")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  const now = Date.now();
  for (const i of data ?? []) {
    const state = i.revoked_at
      ? "revoked"
      : i.used_at
        ? `used by ${i.users?.email ?? "?"}`
        : new Date(i.expires_at).getTime() < now
          ? "expired"
          : `open until ${new Date(i.expires_at).toLocaleDateString()}`;
    console.log(`${i.id}  ${i.kind.padEnd(7)}  ${(i.org_name || "—").padEnd(24)}  ${(i.email ?? "any email").padEnd(28)}  ${state}`);
  }
  if (!data?.length) console.log("No partner invites yet.");
}

async function revoke(id: string | undefined) {
  if (!id) throw new Error("Usage: revoke <invite-id>");
  const { data, error } = await db
    .from("partner_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .is("used_at", null)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  console.log(data ? `Revoked ${id}` : "Nothing to revoke (unknown id, already used, or already revoked).");
}

async function main() {
  const command = args[0];
  if (command === "label" || command === "manager") return create(command);
  if (command === "list") return list();
  if (command === "revoke") return revoke(args[1]);
  console.log("Usage: npm run invite -- <label|manager|list|revoke> [--org NAME] [--email ADDR] [--days N] [--prod]");
  process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
