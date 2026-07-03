import type { Metadata } from "next";
import { requireAdmin } from "@/server/auth/guards";
import { getPlatformSettings } from "@/server/services/settings";
import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Platform settings" };
export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  await requireAdmin();
  const settings = await getPlatformSettings();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Platform settings"
        description="Changes apply to future opportunities and bookings — existing terms are snapshotted."
      />
      <SettingsForm
        initial={{
          depositPercentageTemplates: settings.depositPercentageTemplates.join(", "),
          acceptanceWindowHours: settings.acceptanceWindowHours,
          authorizationWindowDays: settings.authorizationWindowDays,
          paymentMethodGraceDays: settings.paymentMethodGraceDays,
          contentDeadlineDefaultDays: settings.contentDeadlineDefaultDays,
        }}
      />
    </div>
  );
}
