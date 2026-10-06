import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/guards";
import { getAgencyMembership } from "@/server/services/agencies";
import { partnerInviteOrgName } from "@/server/services/invites";
import { BRAND } from "@/lib/brand";
import { AgencyForm } from "./agency-form";

export const metadata: Metadata = { title: "Set up your management company" };
export const dynamic = "force-dynamic";

export default async function ManagerOnboardingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?next=/manager/onboarding");
  if (user.role !== "manager") redirect("/");
  if (await getAgencyMembership(user.id)) redirect("/manager");
  const suggestedName = await partnerInviteOrgName(user.id);

  return (
    <div className="gradient-stage flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-6 rounded-2xl border bg-card/70 p-8 backdrop-blur">
        <div className="space-y-1">
          <h1 className="text-xl font-bold">Set up your management company</h1>
          <p className="text-sm text-muted-foreground">
            Add your creators, request tickets for them, and handle their conversations with
            artist teams on {BRAND.name}.
          </p>
        </div>
        <AgencyForm defaults={{ name: suggestedName }} submitLabel="Create company" />
      </div>
    </div>
  );
}
