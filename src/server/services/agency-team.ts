import "server-only";

import { serviceDb } from "@/server/db/service";
import { audit } from "./audit";
import { notify } from "./notifications";
import { newInviteToken } from "./invites";
import { emailProvider } from "@/server/providers/email";
import { publicEnv } from "@/lib/env";
import { BRAND } from "@/lib/brand";
import type { Database } from "@/lib/database.types";

/**
 * A management company's team (agency_members), mirroring label teams:
 * owners and admins invite teammates as admin or member, change roles and
 * remove people. A manager belongs to one company; invites are claimed by
 * email when the invited person signs up or signs in (claimAgencyInvites).
 */

type TeamRole = Exclude<Database["public"]["Enums"]["company_member_role"], "owner">;
type Actor = { id: string; role: string };
type Result = { ok: true } | { ok: false; error: string };

export async function inviteAgencyMember(input: {
  agencyId: string;
  inviter: Actor;
  email: string;
  role: TeamRole;
}): Promise<Result> {
  const db = serviceDb();
  const email = input.email.trim().toLowerCase();

  const { data: existing } = await db.from("users").select("id, role").eq("email", email).maybeSingle();
  if (existing) {
    const { data: membership } = await db
      .from("agency_members")
      .select("agency_id")
      .eq("user_id", existing.id)
      .maybeSingle();
    if (membership?.agency_id === input.agencyId) return { ok: false, error: "That person is already on the team" };
    if (membership) return { ok: false, error: "That person already belongs to another management company" };
    if (existing.role !== "manager") {
      return { ok: false, error: "That email is already used by a creator or label account" };
    }
  }

  // One open invite per email: a new one replaces the old link.
  await db
    .from("agency_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("agency_id", input.agencyId)
    .ilike("email", email)
    .is("accepted_at", null)
    .is("revoked_at", null);
  const { token, hash } = newInviteToken();
  const { data: invite, error } = await db
    .from("agency_invites")
    .insert({
      agency_id: input.agencyId,
      email,
      role: input.role,
      token_hash: hash,
      invited_by: input.inviter.id,
      expires_at: new Date(Date.now() + 14 * 86_400_000).toISOString(),
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  const { data: agency } = await db.from("agencies").select("name").eq("id", input.agencyId).single();
  const team = agency?.name ?? "a team";
  await emailProvider().send({
    to: email,
    subject: `${BRAND.name}: you're invited to join ${team}`,
    text: `You've been invited to join ${team} on ${BRAND.name}.\n\nCreate your account with this email address: ${publicEnv.appUrl}/join/${token}\n\nIf you already have a management account with this email, just sign in.`,
  });
  if (existing) {
    await notify({
      userId: existing.id,
      type: "invite_received",
      title: `You've been invited to join ${team}`,
      body: "Sign in to accept the invitation.",
      link: "/manager",
    });
  }
  await audit({
    actorId: input.inviter.id,
    actorRole: input.inviter.role,
    action: "agency.invite_member",
    entityType: "agency_invite",
    entityId: invite.id,
    metadata: { agencyId: input.agencyId, email, role: input.role },
  });
  return { ok: true };
}

/** Join the team a manager without one was invited to (sign-up or sign-in). */
export async function claimAgencyInvites(userId: string, email: string): Promise<boolean> {
  const db = serviceDb();
  const { data: invite } = await db
    .from("agency_invites")
    .select("id, agency_id, role")
    .ilike("email", email.toLowerCase())
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!invite) return false;
  // user_id is unique on agency_members: someone already on a team stays put.
  const { error } = await db.from("agency_members").insert({ agency_id: invite.agency_id, user_id: userId, role: invite.role });
  if (error) return false;
  await db
    .from("agency_invites")
    .update({ accepted_at: new Date().toISOString(), accepted_by: userId })
    .eq("id", invite.id);
  await audit({
    actorId: userId,
    actorRole: "manager",
    action: "agency.join",
    entityType: "agency_invite",
    entityId: invite.id,
    metadata: { agencyId: invite.agency_id, role: invite.role },
  });
  return true;
}

async function teammate(agencyId: string, userId: string) {
  const { data } = await serviceDb()
    .from("agency_members")
    .select("id, role")
    .eq("agency_id", agencyId)
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

export async function changeAgencyMemberRole(input: {
  agencyId: string;
  actor: Actor;
  memberUserId: string;
  newRole: TeamRole;
}): Promise<Result> {
  const target = await teammate(input.agencyId, input.memberUserId);
  if (!target) return { ok: false, error: "Member not found" };
  if (target.role === "owner") return { ok: false, error: "The owner's role cannot be changed" };
  await serviceDb().from("agency_members").update({ role: input.newRole }).eq("id", target.id);
  await audit({
    actorId: input.actor.id,
    actorRole: input.actor.role,
    action: "agency.change_member_role",
    entityType: "agency_member",
    entityId: target.id,
    metadata: { agencyId: input.agencyId, memberUserId: input.memberUserId, newRole: input.newRole },
  });
  return { ok: true };
}

export async function removeAgencyMember(input: { agencyId: string; actor: Actor; memberUserId: string }): Promise<Result> {
  if (input.memberUserId === input.actor.id) return { ok: false, error: "You cannot remove yourself" };
  const target = await teammate(input.agencyId, input.memberUserId);
  if (!target) return { ok: false, error: "Member not found" };
  if (target.role === "owner") return { ok: false, error: "The owner cannot be removed" };
  await serviceDb().from("agency_members").delete().eq("id", target.id);
  await audit({
    actorId: input.actor.id,
    actorRole: input.actor.role,
    action: "agency.remove_member",
    entityType: "agency_member",
    entityId: target.id,
    metadata: { agencyId: input.agencyId, memberUserId: input.memberUserId },
  });
  return { ok: true };
}

export async function revokeAgencyInvite(input: { agencyId: string; actor: Actor; inviteId: string }): Promise<void> {
  await serviceDb()
    .from("agency_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", input.inviteId)
    .eq("agency_id", input.agencyId)
    .is("accepted_at", null);
  await audit({
    actorId: input.actor.id,
    actorRole: input.actor.role,
    action: "agency.revoke_invite",
    entityType: "agency_invite",
    entityId: input.inviteId,
    metadata: { agencyId: input.agencyId },
  });
}
