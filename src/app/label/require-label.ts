import "server-only";

import { redirect } from "next/navigation";
import { AuthError, requireLabelWithCompany, type CompanyContext } from "@/server/auth/guards";

/**
 * Page-level guard for the label app: resolves the label user + company or
 * redirects to the right place instead of throwing.
 */
export async function requireLabelPage(): Promise<CompanyContext & { companyName: string }> {
  try {
    return await requireLabelWithCompany();
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.code === "unauthenticated") redirect("/sign-in?next=/label");
      if (err.message === "Company onboarding incomplete") redirect("/label/onboarding");
      redirect("/sign-in");
    }
    throw err;
  }
}
