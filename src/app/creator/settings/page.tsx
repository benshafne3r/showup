import type { Metadata } from "next";
import { requireCreator } from "@/server/auth/guards";
import { getCreatorProfile } from "@/server/services/profiles";
import { PageHeader } from "@/components/page-header";
import { OnboardingForm } from "../onboarding/onboarding-form";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function CreatorSettingsPage() {
  const user = await requireCreator();
  const profile = await getCreatorProfile(user.id);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Account settings"
        description={`Signed in as ${user.email}. Your email stays private — teams only see your display name and socials.`}
      />
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
