import "server-only";

import { serviceDb } from "@/server/db/service";
import { audit } from "./audit";
import { deliver, type NotifyInput } from "./notifications";
import { locationLabel, parseCityState } from "@/lib/roster";
import { copyAvatarToStorage, managedProfileEmail } from "@/lib/managed-profiles";
import { lookupTikTokUser, resolveTikTokHandle, type TikTokProfile } from "@/server/providers/social-metrics";

/**
 * Management companies ("agencies") and their creator rosters. A managed
 * creator's label conversations route to the agency team, either side can
 * request tickets, and content payouts go to the agency's Stripe account.
 */

type Actor = { id: string; role: string };

export async function createAgency(input: {
  userId: string;
  name: string;
  website?: string;
  city?: string;
}): Promise<{ ok: true; agencyId: string } | { ok: false; error: string }> {
  const db = serviceDb();
  const { data: existing } = await db
    .from("agency_members")
    .select("id")
    .eq("user_id", input.userId)
    .maybeSingle();
  if (existing) return { ok: false, error: "You already belong to a management company" };

  const { data: agency, error } = await db
    .from("agencies")
    .insert({ name: input.name, website: input.website || null, city: input.city ?? "" })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  await db.from("agency_members").insert({
    agency_id: agency.id,
    user_id: input.userId,
    role: "owner",
  });
  await audit({
    actorId: input.userId,
    actorRole: "manager",
    action: "agency.create",
    entityType: "agency",
    entityId: agency.id,
    metadata: { name: input.name },
  });
  return { ok: true, agencyId: agency.id };
}

export async function updateAgency(
  agencyId: string,
  actor: Actor,
  patch: { name: string; website?: string; city?: string },
): Promise<void> {
  await serviceDb()
    .from("agencies")
    .update({ name: patch.name, website: patch.website || null, city: patch.city ?? "" })
    .eq("id", agencyId);
  await audit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "agency.update",
    entityType: "agency",
    entityId: agencyId,
  });
}

/** The agency a manager belongs to (MVP: one per manager), or null. */
export async function getAgencyMembership(userId: string) {
  const { data } = await serviceDb()
    .from("agency_members")
    .select("agency_id, role, agencies(id, name, website, city, suspended_at)")
    .eq("user_id", userId)
    .maybeSingle();
  return data ?? null;
}

/** The agency representing a creator, or null if they're independent. */
export async function agencyForCreator(
  creatorId: string,
): Promise<{ id: string; name: string } | null> {
  const { data } = await serviceDb()
    .from("agency_creators")
    .select("agency_id, agencies(name)")
    .eq("creator_id", creatorId)
    .maybeSingle();
  return data ? { id: data.agency_id, name: data.agencies?.name ?? "Management" } : null;
}

/** Agencies for many creators at once: creatorId → agency. */
export async function agenciesForCreators(
  creatorIds: string[],
): Promise<Map<string, { id: string; name: string }>> {
  if (!creatorIds.length) return new Map();
  const { data } = await serviceDb()
    .from("agency_creators")
    .select("creator_id, agency_id, agencies(name)")
    .in("creator_id", creatorIds);
  return new Map(
    (data ?? []).map((r) => [r.creator_id, { id: r.agency_id, name: r.agencies?.name ?? "Management" }]),
  );
}

async function agencyMemberIds(agencyId: string): Promise<string[]> {
  const { data } = await serviceDb()
    .from("agency_members")
    .select("user_id")
    .eq("agency_id", agencyId);
  return (data ?? []).map((m) => m.user_id);
}

export async function isOnRoster(agencyId: string, creatorId: string): Promise<boolean> {
  const { data } = await serviceDb()
    .from("agency_creators")
    .select("id")
    .eq("agency_id", agencyId)
    .eq("creator_id", creatorId)
    .maybeSingle();
  return !!data;
}

/** In-app + email notification to everyone on an agency's team. */
export async function notifyAgency(
  agencyId: string,
  input: Omit<NotifyInput, "userId">,
): Promise<void> {
  const memberIds = await agencyMemberIds(agencyId);
  await Promise.all(
    memberIds.map((userId) =>
      deliver({ ...input, userId, dedupeKey: input.dedupeKey ? `${input.dedupeKey}:${userId}` : undefined }),
    ),
  );
}

export type RosterEntry = {
  creatorId: string;
  fullName: string;
  email: string;
  city: string;
  /** "Los Angeles, California" / "Kentucky" / "Spain" */
  location: string;
  audienceSize: number;
  avatarUrl: string | null;
  handle: string | null;
  followers: { tiktok: number; instagram: number; youtube: number };
  tags: string[];
  /** Agency-run profile with no login of its own. */
  managedProfile: boolean;
  hasCard: boolean;
  pendingRequests: number;
  activeBookings: number;
  joinedAt: string;
};

/** Ids per `.in()` filter, so big rosters don't overflow the request URL. */
const IN_CHUNK = 200;

async function inChunks<T>(ids: string[], load: (chunk: string[]) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data } = await load(ids.slice(i, i + IN_CHUNK));
    out.push(...(data ?? []));
  }
  return out;
}

const ROSTER_SELECT = "creator_id, created_at, users!agency_creators_creator_id_fkey(full_name, email, avatar_url, managed_profile)";

/** The whole roster, in the order creators joined. */
export async function listRoster(agencyId: string): Promise<RosterEntry[]> {
  const { data: rows } = await serviceDb()
    .from("agency_creators")
    .select(ROSTER_SELECT)
    .eq("agency_id", agencyId)
    .order("created_at", { ascending: true });
  return rosterEntries(rows ?? []);
}

/** One page of the roster, biggest audience first, with the true total. */
export async function rosterPage(
  agencyId: string,
  page: { limit: number; offset: number },
): Promise<{ entries: RosterEntry[]; total: number }> {
  const db = serviceDb();
  const { data: ids, error } = await db.rpc("roster_page", {
    p_agency_id: agencyId,
    p_limit: page.limit,
    p_offset: page.offset,
  });
  if (error) throw new Error(`roster page: ${error.message}`);
  const total = Number(ids?.[0]?.total ?? 0);
  if (!ids?.length) return { entries: [], total };
  const order = ids.map((r) => r.creator_id);
  const { data: rows } = await db.from("agency_creators").select(ROSTER_SELECT).in("creator_id", order);
  const byId = new Map((rows ?? []).map((r) => [r.creator_id, r]));
  return { entries: await rosterEntries(order.map((id) => byId.get(id)).filter((r) => r !== undefined)), total };
}

type RosterRow = {
  creator_id: string;
  created_at: string;
  users: { full_name: string; email: string; avatar_url: string | null; managed_profile: boolean } | null;
};

async function rosterEntries(rows: RosterRow[]): Promise<RosterEntry[]> {
  if (!rows.length) return [];
  const db = serviceDb();
  const ids = rows.map((r) => r.creator_id);

  const [profiles, cards, requests, bookings] = await Promise.all([
    inChunks(ids, (chunk) =>
      db
        .from("creator_profiles")
        .select("user_id, city, region, country, categories, audience_size, creator_social_accounts(platform, handle, followers)")
        .in("user_id", chunk),
    ),
    inChunks(ids, (chunk) => db.from("payment_methods").select("user_id").in("user_id", chunk)),
    inChunks(ids, (chunk) => db.from("show_requests").select("creator_id").in("creator_id", chunk).eq("status", "pending")),
    inChunks(ids, (chunk) =>
      db
        .from("bookings")
        .select("creator_id")
        .in("creator_id", chunk)
        .in("status", ["awaiting_acceptance", "awaiting_payment_method", "confirmed", "authorization_failed", "attended", "no_show_review", "disputed"]),
    ),
  ]);
  const profileBy = new Map(profiles.map((p) => [p.user_id, p]));
  const withCard = new Set(cards.map((c) => c.user_id));
  const tally = (list: { creator_id: string }[]) => {
    const n = new Map<string, number>();
    for (const r of list) n.set(r.creator_id, (n.get(r.creator_id) ?? 0) + 1);
    return n;
  };
  const pendingBy = tally(requests);
  const activeBy = tally(bookings);

  return rows.map((r) => {
    const profile = profileBy.get(r.creator_id);
    const followers = { tiktok: 0, instagram: 0, youtube: 0 };
    let handle: string | null = null;
    for (const s of profile?.creator_social_accounts ?? []) {
      if (s.platform === "tiktok" || s.platform === "instagram" || s.platform === "youtube") {
        followers[s.platform] = Math.max(followers[s.platform], s.followers);
      }
      if (s.platform === "tiktok" && s.handle) handle = s.handle;
    }
    return {
      creatorId: r.creator_id,
      fullName: r.users?.full_name || r.users?.email || "Creator",
      email: r.users?.managed_profile ? "" : (r.users?.email ?? ""),
      city: profile?.city ?? "",
      location: profile ? locationLabel(profile) : "",
      audienceSize: profile?.audience_size ?? 0,
      avatarUrl: r.users?.avatar_url ?? null,
      handle,
      followers,
      tags: profile?.categories ?? [],
      managedProfile: !!r.users?.managed_profile,
      hasCard: withCard.has(r.creator_id),
      pendingRequests: pendingBy.get(r.creator_id) ?? 0,
      activeBookings: activeBy.get(r.creator_id) ?? 0,
      joinedAt: r.created_at,
    };
  });
}

/** A creator found from a pasted TikTok link, ready to add to a roster. */
export type RosterCandidate = {
  handle: string;
  name: string;
  avatarUrl: string | null;
  followers: number;
  /** False when TikTok details couldn't be loaded; the manager types the name. */
  found: boolean;
};

/**
 * Look up a TikTok link or @handle for "Add creator": refuses creators already
 * on a roster or with their own ShowUp account.
 */
export async function findRosterCandidate(
  agencyId: string,
  input: string,
  lookup: (handle: string) => Promise<TikTokProfile | null> = lookupTikTokUser,
): Promise<{ ok: true; candidate: RosterCandidate } | { ok: false; error: string }> {
  const handle = await resolveTikTokHandle(input);
  if (!handle) return { ok: false, error: "Paste a TikTok profile link or @handle" };
  const blocked = await rosterConflict(agencyId, handle);
  if (blocked) return { ok: false, error: blocked };
  const profile = await lookup(handle);
  return {
    ok: true,
    candidate: profile
      ? { handle: profile.handle, name: profile.name, avatarUrl: profile.avatarUrl, followers: profile.followers, found: true }
      : { handle, name: "", avatarUrl: null, followers: 0, found: false },
  };
}

/** Why @handle can't be added to this roster, if it can't. */
async function rosterConflict(agencyId: string, handle: string): Promise<string | null> {
  const db = serviceDb();
  const { data: managed } = await db.from("users").select("id").eq("email", managedProfileEmail(handle)).maybeSingle();
  if (managed) {
    const current = await agencyForCreator(managed.id);
    if (current?.id === agencyId) return `@${handle} is already on your roster`;
    if (current) return `@${handle} is on another management company's roster`;
  }
  // A creator who signed up themselves manages their own account.
  const { data: own } = await db
    .from("creator_social_accounts")
    .select("creator_profiles!inner(users!inner(managed_profile))")
    .eq("platform", "tiktok")
    .ilike("handle", handle)
    .eq("creator_profiles.users.managed_profile", false)
    .limit(1);
  if (own?.length) return `@${handle} already has their own ShowUp account`;
  return null;
}

/**
 * Add a creator to the agency's roster as a managed profile (no login, no
 * email sent): their TikTok photo and follower count are looked up here on
 * the server, the name, location and genres come from the manager. Re-adding
 * someone the agency removed earlier reuses their profile.
 */
export async function addManagedCreator(
  input: {
    agencyId: string;
    actor: Actor;
    handleInput: string;
    name: string;
    location: string;
    genres: string[];
  },
  lookup: (handle: string) => Promise<TikTokProfile | null> = lookupTikTokUser,
): Promise<{ ok: true; creatorId: string } | { ok: false; error: string }> {
  const db = serviceDb();
  const handle = await resolveTikTokHandle(input.handleInput);
  if (!handle) return { ok: false, error: "Paste a TikTok profile link or @handle" };
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Add their name" };
  const blocked = await rosterConflict(input.agencyId, handle);
  if (blocked) return { ok: false, error: blocked };

  const profile = await lookup(handle);
  const email = managedProfileEmail(handle);
  let { data: user } = await db.from("users").select("id").eq("email", email).maybeSingle();
  if (!user) {
    const { data, error } = await db.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: name },
    });
    if (error || !data.user) return { ok: false, error: "Couldn't add them. Please try again" };
    user = { id: data.user.id };
  }
  const creatorId = user.id;
  const avatarUrl = profile?.avatarUrl ? await copyAvatarToStorage(db, creatorId, profile.avatarUrl) : null;
  check(
    await db
      .from("users")
      .update({ full_name: name, managed_profile: true, ...(avatarUrl ? { avatar_url: avatarUrl } : {}) })
      .eq("id", creatorId),
    "save managed creator",
  );

  const where = parseCityState(input.location);
  const followers = profile?.followers ?? 0;
  const { data: creatorProfile } = await db
    .from("creator_profiles")
    .upsert(
      {
        user_id: creatorId,
        city: where.city,
        region: where.region,
        country: where.country,
        categories: [...new Set(input.genres.map((g) => g.trim().toLowerCase()).filter(Boolean))].slice(0, 8),
        audience_size: followers,
        onboarded_at: new Date().toISOString(),
        new_show_alerts: false,
      },
      { onConflict: "user_id" },
    )
    .select("id")
    .single();
  if (!creatorProfile) return { ok: false, error: "Couldn't save their profile. Please try again" };
  await db.from("creator_social_accounts").delete().eq("profile_id", creatorProfile.id).eq("platform", "tiktok");
  check(
    await db.from("creator_social_accounts").insert({
      profile_id: creatorProfile.id,
      platform: "tiktok",
      handle,
      url: `https://www.tiktok.com/@${handle}`,
      followers,
    }),
    "save tiktok account",
  );

  const { error: linkError } = await db
    .from("agency_creators")
    .insert({ agency_id: input.agencyId, creator_id: creatorId, added_by: input.actor.id });
  if (linkError) {
    return { ok: false, error: linkError.code === "23505" ? `@${handle} is already on a roster` : "Couldn't add them to your roster" };
  }
  await audit({
    actorId: input.actor.id,
    actorRole: input.actor.role,
    action: "agency.add_managed_creator",
    entityType: "agency_creator",
    entityId: creatorId,
    metadata: { agencyId: input.agencyId, handle },
  });
  return { ok: true, creatorId };
}

const check = <T>(res: { data: T; error: { message: string } | null }, what: string): T => {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
};

/** The agency drops a creator from its roster. */
export async function removeFromRoster(input: {
  agencyId: string;
  actor: Actor;
  creatorId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = serviceDb();
  const { data: removed } = await db
    .from("agency_creators")
    .delete()
    .eq("agency_id", input.agencyId)
    .eq("creator_id", input.creatorId)
    .select("id")
    .maybeSingle();
  if (!removed) return { ok: false, error: "That creator isn't on your roster" };

  const { data: agency } = await db.from("agencies").select("name").eq("id", input.agencyId).single();
  await deliver({
    userId: input.creatorId,
    type: "invite_received",
    title: `${agency?.name ?? "Your management"} no longer represents you`,
    body: "You'll now message artist teams and receive payouts directly.",
    link: "/creator/settings",
  });
  await audit({
    actorId: input.actor.id,
    actorRole: input.actor.role,
    action: "agency.remove_creator",
    entityType: "agency_creator",
    entityId: removed.id,
    metadata: { agencyId: input.agencyId, creatorId: input.creatorId },
  });
  return { ok: true };
}

/** A creator leaves their management company. */
export async function leaveAgency(creatorId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = serviceDb();
  const { data: removed } = await db
    .from("agency_creators")
    .delete()
    .eq("creator_id", creatorId)
    .select("id, agency_id")
    .maybeSingle();
  if (!removed) return { ok: false, error: "You're not represented by a management company" };

  const { data: user } = await db.from("users").select("full_name").eq("id", creatorId).single();
  await notifyAgency(removed.agency_id, {
    type: "invite_received",
    title: `${user?.full_name || "A creator"} left your roster`,
    body: "Their label conversations and payouts no longer route through your team.",
    link: "/manager",
  });
  await audit({
    actorId: creatorId,
    actorRole: "creator",
    action: "agency.leave",
    entityType: "agency_creator",
    entityId: removed.id,
    metadata: { agencyId: removed.agency_id },
  });
  return { ok: true };
}
