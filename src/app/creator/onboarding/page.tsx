import type { Metadata } from "next";
import { requireCreator } from "@/server/auth/guards";
import { getCreatorProfile } from "@/server/services/profiles";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Creator onboarding" };
export const dynamic = "force-dynamic";

export default async function CreatorOnboardingPage() {
  const user = await requireCreator();
  const profile = await getCreatorProfile(user.id);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">
          Set up your creator profile
        </h1>
        <p className="text-sm text-muted-foreground">
          Artist teams review this when you request tickets — make it count.
        </p>
      </div>
      <OnboardingForm
        mode="onboarding"
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
