import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser, getMemberCompany } from "@/server/auth/guards";
import { BRAND } from "@/lib/brand";
import { CompanyOnboardingForm } from "./company-form";

export const metadata: Metadata = { title: "Company onboarding" };
export const dynamic = "force-dynamic";

export default async function LabelOnboardingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?next=/label/onboarding");
  if (user.role !== "label") redirect("/");
  const membership = await getMemberCompany(user.id);
  if (membership) redirect("/label");

  return (
    <div className="gradient-stage flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-6 rounded-2xl border bg-card/70 p-8 backdrop-blur">
        <div className="space-y-1">
          <h1 className="text-xl font-bold">Set up your company</h1>
          <p className="text-sm text-muted-foreground">
            Your team will manage artists, tours, and creator opportunities on {BRAND.name}.
          </p>
        </div>
        <CompanyOnboardingForm />
      </div>
    </div>
  );
}
