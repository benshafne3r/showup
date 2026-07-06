import "server-only";

import { serviceDb } from "@/server/db/service";
import { claimInvites } from "@/server/services/companies";

/**
 * Role-appropriate landing path for a freshly authenticated user (sign-in,
 * or sign-up after email confirmation). Labels get their pending invites
 * claimed and route to onboarding until they belong to a company; creators
 * route to onboarding until their profile is complete.
 */
export async function destinationFor(userId: string): Promise<string> {
  const db = serviceDb();
  const { data: user } = await db
    .from("users")
    .select("role, email")
    .eq("id", userId)
    .maybeSingle();
  if (!user) return "/";
  if (user.role === "admin") return "/admin";
  if (user.role === "label") {
    await claimInvites(userId, user.email);
    const { data: membership } = await db
      .from("company_members")
      .select("id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    return membership ? "/label" : "/label/onboarding";
  }
  const { data: profile } = await db
    .from("creator_profiles")
    .select("onboarded_at")
    .eq("user_id", userId)
    .maybeSingle();
  return profile?.onboarded_at ? "/creator" : "/creator/onboarding";
}
