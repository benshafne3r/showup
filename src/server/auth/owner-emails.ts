/**
 * The platform owner(s). Supabase verifies these addresses at sign-in, and both
 * already exist, so nobody else can register them. OWNER_EMAILS adds extra
 * owners for local dev / CI only (unset in production).
 */
const PLATFORM_OWNER_EMAILS = ["ben@50-50ventures.com", "benshafner@gmail.com"];

const extraOwners = (process.env.OWNER_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isPlatformOwner(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.toLowerCase();
  return PLATFORM_OWNER_EMAILS.includes(e) || extraOwners.includes(e);
}
