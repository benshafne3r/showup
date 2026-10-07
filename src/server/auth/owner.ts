import "server-only";

import { redirect } from "next/navigation";
import { getRealSessionUser, type SessionUser } from "./guards";
import { isPlatformOwner } from "./owner-emails";

export { isPlatformOwner };

/**
 * Page guard for /owner: the REAL signed-in user must be a platform owner
 * (so the dashboard stays reachable while viewing the app as someone else).
 */
export async function requireOwnerPage(): Promise<SessionUser> {
  const user = await getRealSessionUser();
  if (!user) redirect("/sign-in?next=/owner");
  if (user.status !== "active" || !isPlatformOwner(user.email)) redirect("/");
  return user;
}
