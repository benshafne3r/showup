import "server-only";

import { serviceDb } from "@/server/db/service";
import { audit } from "./audit";
import { notify } from "./notifications";
import { emailProvider } from "@/server/providers/email";
import { publicEnv } from "@/lib/env";
import { BRAND } from "@/lib/brand";
import type { Database } from "@/lib/database.types";

type MemberRole = Database["public"]["Enums"]["company_member_role"];

export async function createCompany(input: {
  userId: string;
  name: string;
  kind: "label" | "management" | "agency";
  website?: string;
}): Promise<{ ok: true; companyId: string } | { ok: false; error: string }> {
  const db = serviceDb();

  const { data: existing } = await db
    .from("company_members")
    .select("id")
    .eq("user_id", input.userId)
    .maybeSingle();
  if (existing) return { ok: false, error: "You already belong to a company" };

  const { data: company, error } = await db
    .from("companies")
    .insert({
      name: input.name,
      kind: input.kind,
      website: input.website || null,
      onboarded_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  await db.from("company_members").insert({
    company_id: company.id,
    user_id: input.userId,
    role: "owner",
  });

  await audit({
    actorId: input.userId,
    actorRole: "label",
    action: "company.create",
    entityType: "company",
    entityId: company.id,
    companyId: company.id,
    metadata: { name: input.name },
  });
  return { ok: true, companyId: company.id };
}

export async function inviteMember(input: {
  companyId: string;
  inviter: { id: string; role: string };
  email: string;
  role: Exclude<MemberRole, "owner">;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = serviceDb();
  const email = input.email.trim().toLowerCase();

  // Already a member?
  const { data: existingUser } = await db.from("users").select("id").eq("email", email).maybeSingle();
  if (existingUser) {
    const { data: member } = await db
      .from("company_members")
      .select("id")
      .eq("company_id", input.companyId)
      .eq("user_id", existingUser.id)
      .maybeSingle();
    if (member) return { ok: false, error: "That person is already on the team" };
  }

  const { error } = await db.from("company_invites").upsert(
    {
      company_id: input.companyId,
      email,
      role: input.role,
      invited_by: input.inviter.id,
      expires_at: new Date(Date.now() + 14 * 86400000).toISOString(),
      accepted_at: null,
    },
    { onConflict: "company_id,email" },
  );
  if (error) return { ok: false, error: error.message };

  const { data: company } = await db.from("companies").select("name").eq("id", input.companyId).single();
  await emailProvider().send({
    to: email,
    subject: `${BRAND.name} — you're invited to join ${company?.name ?? "a team"}`,
    text: `You've been invited to join ${company?.name ?? "a team"} on ${BRAND.name}.\n\nSign up with this email address to join automatically: ${publicEnv.appUrl}/sign-up?role=label\n\nIf you already have a label account with this email, just sign in.`,
  });
  if (existingUser) {
    await notify({
      userId: existingUser.id,
      type: "invite_received",
      title: `You've been invited to join ${company?.name ?? "a team"}`,
      body: "Sign in to accept the invitation.",
      link: "/label",
    });
  }

  await audit({
    actorId: input.inviter.id,
    actorRole: input.inviter.role,
    action: "company.invite_member",
    entityType: "company_invite",
    companyId: input.companyId,
    metadata: { email, role: input.role },
  });
  return { ok: true };
}

/**
 * Claim pending invites for a label user's email — called at label
 * onboarding and label sign-in so invited teammates land in the company.
 */
export async function claimInvites(userId: string, email: string): Promise<number> {
  const db = serviceDb();
  const { data: invites } = await db
    .from("company_invites")
    .select("id, company_id, role")
    .eq("email", email.toLowerCase())
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString());
  if (!invites?.length) return 0;

  let claimed = 0;
  for (const invite of invites) {
    const { error } = await db.from("company_members").upsert(
      { company_id: invite.company_id, user_id: userId, role: invite.role },
      { onConflict: "company_id,user_id" },
    );
    if (!error) {
      await db
        .from("company_invites")
        .update({ accepted_at: new Date().toISOString() })
        .eq("id", invite.id);
      claimed++;
    }
  }
  return claimed;
}

export async function removeMember(input: {
  companyId: string;
  actor: { id: string; role: string };
  memberUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = serviceDb();
  if (input.memberUserId === input.actor.id) {
    return { ok: false, error: "You cannot remove yourself" };
  }
  const { data: target } = await db
    .from("company_members")
    .select("id, role")
    .eq("company_id", input.companyId)
    .eq("user_id", input.memberUserId)
    .maybeSingle();
  if (!target) return { ok: false, error: "Member not found" };
  if (target.role === "owner") return { ok: false, error: "The owner cannot be removed" };

  await db.from("company_members").delete().eq("id", target.id);
  await audit({
    actorId: input.actor.id,
    actorRole: input.actor.role,
    action: "company.remove_member",
    entityType: "company_member",
    entityId: target.id,
    companyId: input.companyId,
    metadata: { memberUserId: input.memberUserId },
  });
  return { ok: true };
}

export async function changeMemberRole(input: {
  companyId: string;
  actor: { id: string; role: string };
  memberUserId: string;
  newRole: Exclude<MemberRole, "owner">;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = serviceDb();
  const { data: target } = await db
    .from("company_members")
    .select("id, role")
    .eq("company_id", input.companyId)
    .eq("user_id", input.memberUserId)
    .maybeSingle();
  if (!target) return { ok: false, error: "Member not found" };
  if (target.role === "owner") return { ok: false, error: "The owner's role cannot be changed" };

  await db.from("company_members").update({ role: input.newRole }).eq("id", target.id);
  await audit({
    actorId: input.actor.id,
    actorRole: input.actor.role,
    action: "company.change_member_role",
    entityType: "company_member",
    entityId: target.id,
    companyId: input.companyId,
    metadata: { newRole: input.newRole },
  });
  return { ok: true };
}
