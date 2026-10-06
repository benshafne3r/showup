import "server-only";

import { redirect } from "next/navigation";
import { AuthError, requireManagerWithAgency, type AgencyContext } from "@/server/auth/guards";

/**
 * Page-level guard for the management app: resolves the manager + agency or
 * redirects to the right place instead of throwing.
 */
export async function requireManagerPage(): Promise<AgencyContext> {
  try {
    return await requireManagerWithAgency();
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.code === "unauthenticated") redirect("/sign-in?next=/manager");
      if (err.message === "Management onboarding incomplete") redirect("/manager/onboarding");
      redirect("/sign-in");
    }
    throw err;
  }
}
