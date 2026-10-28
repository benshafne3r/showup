import "server-only";

import { serviceDb } from "@/server/db/service";
import { audit } from "./audit";
import { deliver, type NotifyInput } from "./notifications";
import { newInviteToken } from "./invites";
import { emailProvider } from "@/server/providers/email";
import { notificationEmailHtml } from "@/server/providers/email/template";
import { publicEnv } from "@/lib/env";
import { BRAND } from "@/lib/brand";
import { locationLabel } from "@/lib/roster";

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

export async function listOpenInvites(agencyId: string) {
  const { data } = await serviceDb()
    .from("agency_invites")
    .select("id, email, full_name, created_at, expires_at")
    .eq("agency_id", agencyId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  return data ?? [];
}

/**
 * Invite a creator onto the roster. Returns the join link so the manager can
 * also send it directly (it's emailed too). Re-inviting an email replaces the
 * previous open invite.
 */
export async function inviteCreator(input: {
  agencyId: string;
  inviter: Actor;
  email: string;
  fullName: string;
}): Promise<{ ok: true; link: string } | { ok: false; error: string }> {
  const db = serviceDb();
  const email = input.email.trim().toLowerCase();

  const { data: existingUser } = await db
    .from("users")
    .select("id, role")
    .eq("email", email)
    .maybeSingle();
  if (existingUser) {
    if (existingUser.role !== "creator") {
      return { ok: false, error: "That email belongs to a label or management account" };
    }
    const current = await agencyForCreator(existingUser.id);
    if (current?.id === input.agencyId) return { ok: false, error: "That creator is already on your roster" };
    if (current) return { ok: false, error: "That creator is already represented by another management company" };
  }

  await db
    .from("agency_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("agency_id", input.agencyId)
    .ilike("email", email)
    .is("accepted_at", null)
    .is("revoked_at", null);

  const { token, hash } = newInviteToken();
  const { error } = await db.from("agency_invites").insert({
    agency_id: input.agencyId,
    email,
    full_name: input.fullName.trim(),
    token_hash: hash,
    invited_by: input.inviter.id,
  });
  if (error) return { ok: false, error: error.message };

  const { data: agency } = await db.from("agencies").select("name").eq("id", input.agencyId).single();
  const agencyName = agency?.name ?? "Your management";
  const link = `${publicEnv.appUrl}/join/${token}`;
  const greeting = input.fullName.trim().split(" ")[0] || "there";
  const body = `${agencyName} added you to their roster on ${BRAND.name}: free concert tickets for creators. Join to see shows near you and add your card for ticket holds; ${agencyName} handles conversations with artist teams for you.`;
  await emailProvider().send({
    to: email,
    subject: `${BRAND.name}: ${agencyName} invited you`,
    text: `Hi ${greeting},\n\n${body}\n\nAccept the invite: ${link}\n\nThis link expires in 14 days.\n\nThe ${BRAND.name} team`,
    html: notificationEmailHtml({
      name: greeting,
      title: `${agencyName} invited you to ${BRAND.name}`,
      body,
      href: link,
    }),
  });
  if (existingUser) {
    await deliver({
      userId: existingUser.id,
      type: "invite_received",
      title: `${agencyName} wants to represent you`,
      body: "Open the invite to accept or ignore it.",
      link: `/join/${token}`,
    });
  }

  await audit({
    actorId: input.inviter.id,
    actorRole: input.inviter.role,
    action: "agency.invite_creator",
    entityType: "agency_invite",
    metadata: { agencyId: input.agencyId, email },
  });
  return { ok: true, link };
}

export async function revokeInvite(agencyId: string, inviteId: string, actor: Actor): Promise<void> {
  await serviceDb()
    .from("agency_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", inviteId)
    .eq("agency_id", agencyId)
    .is("accepted_at", null);
  await audit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "agency.revoke_invite",
    entityType: "agency_invite",
    entityId: inviteId,
    metadata: { agencyId },
  });
}

/** A creator accepts a roster invite (new sign-up or existing account). */
export async function acceptRosterInvite(input: {
  inviteId: string;
  agencyId: string;
  creatorId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = serviceDb();
  const { data: user } = await db
    .from("users")
    .select("role, full_name")
    .eq("id", input.creatorId)
    .single();
  if (user?.role !== "creator") return { ok: false, error: "Only creator accounts can join a roster" };

  const current = await agencyForCreator(input.creatorId);
  if (current?.id === input.agencyId) return { ok: true };
  if (current) {
    return { ok: false, error: `You're already represented by ${current.name}. Leave them first from your Profile.` };
  }

  // Claim the invite first so a link can't be replayed.
  const { data: claimed } = await db
    .from("agency_invites")
    .update({ accepted_at: new Date().toISOString(), accepted_by: input.creatorId })
    .eq("id", input.inviteId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("id")
    .maybeSingle();
  if (!claimed) return { ok: false, error: "This invite has expired or was already used" };

  const { error } = await db.from("agency_creators").insert({
    agency_id: input.agencyId,
    creator_id: input.creatorId,
  });
  if (error) return { ok: false, error: "Could not join the roster. Please try again" };

  await notifyAgency(input.agencyId, {
    type: "invite_received",
    title: `${user.full_name || "A creator"} joined your roster`,
    body: "Their label conversations and payouts now route through your team.",
    link: "/manager",
  });
  await audit({
    actorId: input.creatorId,
    actorRole: "creator",
    action: "agency.join",
    entityType: "agency_creator",
    metadata: { agencyId: input.agencyId },
  });
  return { ok: true };
}

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
