import "server-only";

import { serviceDb } from "@/server/db/service";
import type { Database } from "@/lib/database.types";

type SocialPlatform = Database["public"]["Enums"]["social_platform"];

export type SocialAccountInput = {
  platform: SocialPlatform;
  handle: string;
  followers: number;
  avgViews: number;
};

export async function upsertCreatorProfile(input: {
  userId: string;
  city: string;
  country?: string;
  bio: string;
  categories: string[];
  audienceSize: number;
  avgViews: number;
  exampleWork: string[]; // urls
  socialAccounts: SocialAccountInput[];
  markOnboarded?: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = serviceDb();

  const { data: existing } = await db
    .from("creator_profiles")
    .select("id, onboarded_at")
    .eq("user_id", input.userId)
    .maybeSingle();

  const values = {
    user_id: input.userId,
    city: input.city,
    country: input.country ?? "US",
    bio: input.bio,
    categories: input.categories,
    audience_size: input.audienceSize,
    avg_views: input.avgViews,
    example_work: input.exampleWork as never,
  };

  let profileId: string;
  if (existing) {
    const { error } = await db
      .from("creator_profiles")
      .update({
        ...values,
        onboarded_at:
          existing.onboarded_at ?? (input.markOnboarded ? new Date().toISOString() : null),
      })
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
    profileId = existing.id;
  } else {
    const { data, error } = await db
      .from("creator_profiles")
      .insert({
        ...values,
        onboarded_at: input.markOnboarded ? new Date().toISOString() : null,
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    profileId = data.id;
  }

  // Replace social accounts (small list, simplest correct behavior).
  await db.from("creator_social_accounts").delete().eq("profile_id", profileId);
  if (input.socialAccounts.length > 0) {
    const { error } = await db.from("creator_social_accounts").insert(
      input.socialAccounts.map((s) => ({
        profile_id: profileId,
        platform: s.platform,
        handle: s.handle.replace(/^@/, ""),
        followers: s.followers,
        avg_views: s.avgViews,
      })),
    );
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function getCreatorProfile(userId: string) {
  const db = serviceDb();
  const { data: profile } = await db
    .from("creator_profiles")
    .select("*, creator_social_accounts(*)")
    .eq("user_id", userId)
    .maybeSingle();
  return profile;
}

/** Public-safe creator view for label request review: no email/phone. */
export async function getCreatorPublicProfile(creatorId: string) {
  const db = serviceDb();
  const [{ data: user }, profile] = await Promise.all([
    db.from("users").select("id, full_name, avatar_url, verified_at, created_at").eq("id", creatorId).maybeSingle(),
    getCreatorProfile(creatorId),
  ]);
  if (!user) return null;
  return {
    id: user.id,
    fullName: user.full_name,
    avatarUrl: user.avatar_url,
    verifiedAt: user.verified_at,
    memberSince: user.created_at,
    profile,
  };
}
