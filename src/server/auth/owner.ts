import "server-only";

import { redirect } from "next/navigation";
import { getSessionUser, type SessionUser } from "./guards";

/**
 * The platform owner(s): can open /owner from whichever account they're signed
 * into (label, creator, …). Supabase verifies these addresses at sign-in, and
 * both already exist, so nobody else can register them.
 */
const PLATFORM_OWNER_EMAILS = ["ben@50-50ventures.com", "benshafner@gmail.com"];

/** Extra owners for local dev / CI only (e.g. a seeded demo account). Unset in production. */
const extraOwners = (process.env.OWNER_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isPlatformOwner(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.toLowerCase();
  return PLATFORM_OWNER_EMAILS.includes(e) || extraOwners.includes(e);
}

/** Page guard: owners only; everyone else gets a plain 404-style redirect home. */
export async function requireOwnerPage(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?next=/owner");
  if (user.status !== "active" || !isPlatformOwner(user.email)) redirect("/");
  return user;
}
