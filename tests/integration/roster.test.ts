import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { addManagedCreator, findRosterCandidate } from "@/server/services/agencies";
import type { TikTokProfile } from "@/server/providers/social-metrics";
import { db } from "./fixtures";

/**
 * Agencies add creators from a TikTok link as managed profiles: no login, no
 * email, on the roster straight away. Someone already on a roster, or with
 * their own ShowUp account, can't be added.
 */

async function agencies() {
  const { data: manager } = await db.from("users").select("id").eq("email", "manager@demo.showup.test").single();
  const { data: member } = await db.from("agency_members").select("agency_id").eq("user_id", manager!.id).single();
  const { data: other } = await db.from("agencies").insert({ name: `Other ${randomUUID().slice(0, 6)}` }).select("id").single();
  return { managerId: manager!.id, agencyId: member!.agency_id, otherAgencyId: other!.id };
}

/** TikTok as TikWM would describe @handle (no network in tests). */
const fakeTikTok =
  (followers: number) =>
  async (handle: string): Promise<TikTokProfile> => ({ handle, name: "From TikTok", avatarUrl: null, followers, bio: "" });

describe("adding a creator from TikTok", () => {
  it("finds the profile, then adds a managed profile to the roster without an email", async () => {
    const { managerId, agencyId } = await agencies();
    const handle = `newcreator${randomUUID().slice(0, 6)}`;

    const found = await findRosterCandidate(agencyId, `https://www.tiktok.com/@${handle}?lang=en`, fakeTikTok(48_000));
    expect(found).toMatchObject({ ok: true, candidate: { handle, name: "From TikTok", followers: 48_000, found: true } });

    const added = await addManagedCreator(
      { agencyId, actor: { id: managerId, role: "manager" }, handleInput: `@${handle}`, name: "Jordan Lee", location: "Austin, TX", genres: ["Comedy", "dance", "comedy"] },
      fakeTikTok(48_000),
    );
    expect(added.ok).toBe(true);
    const creatorId = (added as { creatorId: string }).creatorId;

    const { data: user } = await db.from("users").select("email, full_name, managed_profile, role").eq("id", creatorId).single();
    expect(user).toMatchObject({ full_name: "Jordan Lee", managed_profile: true, role: "creator" });
    expect(user!.email).toMatch(/@profiles\.showup\.invalid$/); // a placeholder; nobody is emailed
    const { data: profile } = await db
      .from("creator_profiles")
      .select("city, region, country, categories, audience_size, onboarded_at, creator_social_accounts(platform, handle, followers)")
      .eq("user_id", creatorId)
      .single();
    expect(profile).toMatchObject({ city: "Austin", region: "TX", country: "US", categories: ["comedy", "dance"], audience_size: 48_000 });
    expect(profile!.onboarded_at).not.toBeNull();
    expect(profile!.creator_social_accounts).toEqual([{ platform: "tiktok", handle, followers: 48_000 }]);
    const { data: link } = await db.from("agency_creators").select("agency_id").eq("creator_id", creatorId).single();
    expect(link!.agency_id).toBe(agencyId);

    // Adding them again (this agency or another) is refused.
    const again = await findRosterCandidate(agencyId, `@${handle}`, fakeTikTok(1));
    expect(again).toEqual({ ok: false, error: `@${handle} is already on your roster` });
    const { otherAgencyId } = await agencies();
    const elsewhere = await addManagedCreator(
      { agencyId: otherAgencyId, actor: { id: managerId, role: "manager" }, handleInput: handle, name: "Copy", location: "", genres: [] },
      fakeTikTok(1),
    );
    expect(elsewhere).toEqual({ ok: false, error: `@${handle} is on another management company's roster` });
  });

  it("lets the manager type the name when TikTok details can't be loaded", async () => {
    const { agencyId } = await agencies();
    const handle = `quietcreator${randomUUID().slice(0, 6)}`;
    const found = await findRosterCandidate(agencyId, handle, async () => null);
    expect(found).toMatchObject({ ok: true, candidate: { handle, name: "", followers: 0, found: false } });
  });

  it("won't take over a creator who has their own ShowUp account", async () => {
    const { agencyId } = await agencies();
    const { data: own } = await db
      .from("creator_social_accounts")
      .select("handle, creator_profiles!inner(users!inner(managed_profile))")
      .eq("platform", "tiktok")
      .eq("creator_profiles.users.managed_profile", false)
      .limit(1)
      .single();
    const result = await findRosterCandidate(agencyId, `@${own!.handle}`, fakeTikTok(1));
    expect(result).toEqual({ ok: false, error: `@${own!.handle.toLowerCase()} already has their own ShowUp account` });
  });

  it("refuses something that isn't a TikTok link", async () => {
    const { agencyId } = await agencies();
    expect(await findRosterCandidate(agencyId, "https://instagram.com/someone", fakeTikTok(1))).toEqual({
      ok: false,
      error: "Paste a TikTok profile link or @handle",
    });
  });
});
