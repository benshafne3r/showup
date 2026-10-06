import type { Metadata } from "next";
import { requireCreator } from "@/server/auth/guards";
import { getCreatorProfile } from "@/server/services/profiles";
import { agencyForCreator } from "@/server/services/agencies";
import { leaveAgencyAction } from "../actions";
import { ConfirmActionButton } from "@/components/confirm-action-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { OnboardingForm } from "../onboarding/onboarding-form";

export const metadata: Metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

export default async function CreatorSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ joined?: string; left?: string }>;
}) {
  const user = await requireCreator();
  const params = await searchParams;
  const [profile, agency] = await Promise.all([
    getCreatorProfile(user.id),
    agencyForCreator(user.id),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Profile"
        description={`Signed in as ${user.email}. Your email stays private — teams only see your display name and socials.`}
      />
      {params.joined && agency ? (
        <div role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          You joined {agency.name}. Finish your profile below and add a card under Payments.
        </div>
      ) : null}
      {params.left && !agency ? (
        <div role="status" className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">
          You&apos;re independent now — you&apos;ll message artist teams and get paid directly.
        </div>
      ) : null}
      {agency ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Management</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <p className="text-muted-foreground">
              Represented by <span className="font-medium text-foreground">{agency.name}</span>.
              They handle conversations with artist teams and receive your content payouts.
            </p>
            <ConfirmActionButton
              action={leaveAgencyAction}
              triggerLabel="Leave"
              title={`Leave ${agency.name}?`}
              description="You'll message artist teams and receive payouts yourself from now on. Your existing requests and bookings stay as they are."
              confirmLabel="Leave"
              cancelLabel="Stay"
            />
          </CardContent>
        </Card>
      ) : null}
      <OnboardingForm
        mode="settings"
        initial={{
          city: profile?.city ?? "",
          bio: profile?.bio ?? "",
          categories: (profile?.categories ?? []).join(", "),
          audienceSize: profile?.audience_size ?? 0,
          avgViews: profile?.avg_views ?? 0,
          exampleWork: Array.isArray(profile?.example_work)
            ? (profile!.example_work as string[]).join("\n")
            : "",
          socials: (profile?.creator_social_accounts ?? []).map((s) => ({
            platform: s.platform,
            handle: s.handle,
            followers: s.followers,
            avgViews: s.avg_views,
          })),
        }}
      />
    </div>
  );
}
