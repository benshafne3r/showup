import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  changeAgencyMemberRole,
  claimAgencyInvites,
  inviteAgencyMember,
  removeAgencyMember,
} from "@/server/services/agency-team";
import { newInviteToken, resolveInvite } from "@/server/services/invites";
import { db } from "./fixtures";

/**
 * Management teams work like label teams: an owner or admin invites someone as
 * an admin or member, the invite is claimed when they sign up as a manager,
 * and roles can be switched (never the owner's) or the teammate removed.
 */

async function northside() {
  const { data: manager } = await db.from("users").select("id").eq("email", "manager@demo.showup.test").single();
  const { data: member } = await db.from("agency_members").select("agency_id").eq("user_id", manager!.id).single();
  return { ownerId: manager!.id, agencyId: member!.agency_id, actor: { id: manager!.id, role: "manager" } };
}

/** A brand-new manager account with no team yet (as after an invite sign-up). */
async function newManager(email: string) {
  const { data, error } = await db.auth.admin.createUser({ email, password: `Pw-${randomUUID()}`, email_confirm: true });
  if (error) throw new Error(error.message);
  for (let i = 0; i < 10; i++) {
    const { data: row } = await db.from("users").select("id").eq("id", data.user.id).maybeSingle();
    if (row) break;
    await new Promise((r) => setTimeout(r, 150));
  }
  await db.from("users").update({ role: "manager" }).eq("id", data.user.id);
  return data.user.id;
}

describe("management team", () => {
  it("invites someone as an admin, who joins with that role; roles switch and they can be removed", async () => {
    const { agencyId, actor } = await northside();
    const email = `teammate-${randomUUID().slice(0, 8)}@example.com`;

    expect(await inviteAgencyMember({ agencyId, inviter: actor, email, role: "admin" })).toEqual({ ok: true });
    const { data: invite } = await db.from("agency_invites").select("role, token_hash").eq("email", email).single();
    expect(invite!.role).toBe("admin");

    const userId = await newManager(email);
    expect(await claimAgencyInvites(userId, email)).toBe(true);
    const { data: member } = await db.from("agency_members").select("agency_id, role").eq("user_id", userId).single();
    expect(member).toEqual({ agency_id: agencyId, role: "admin" });

    expect(await changeAgencyMemberRole({ agencyId, actor, memberUserId: userId, newRole: "member" })).toEqual({ ok: true });
    expect((await db.from("agency_members").select("role").eq("user_id", userId).single()).data!.role).toBe("member");

    expect(await removeAgencyMember({ agencyId, actor, memberUserId: userId })).toEqual({ ok: true });
    expect((await db.from("agency_members").select("id").eq("user_id", userId)).data).toEqual([]);
  });

  it("refuses people already on the team, on another team, or with a creator account; never changes the owner", async () => {
    const { ownerId, agencyId, actor } = await northside();
    expect(await inviteAgencyMember({ agencyId, inviter: actor, email: "manager@demo.showup.test", role: "admin" })).toEqual({
      ok: false,
      error: "That person is already on the team",
    });
    expect(await inviteAgencyMember({ agencyId, inviter: actor, email: "creator.mia@demo.showup.test", role: "member" })).toEqual({
      ok: false,
      error: "That email is already used by a creator or label account",
    });
    expect(await changeAgencyMemberRole({ agencyId, actor, memberUserId: ownerId, newRole: "member" })).toEqual({
      ok: false,
      error: "The owner's role cannot be changed",
    });
  });

  it("a teammate invite link resolves to that management team, and only while it's open", async () => {
    const { agencyId } = await northside();
    const email = `link-${randomUUID().slice(0, 8)}@example.com`;
    const { token, hash } = newInviteToken();
    const { data: row } = await db
      .from("agency_invites")
      .insert({ agency_id: agencyId, email, role: "member", token_hash: hash, expires_at: new Date(Date.now() + 86_400_000).toISOString() })
      .select("id")
      .single();

    expect(await resolveInvite(token)).toMatchObject({ kind: "agency_team", id: row!.id, agencyId, agencyName: "Northside Talent", email });
    await db.from("agency_invites").update({ revoked_at: new Date().toISOString() }).eq("id", row!.id);
    expect(await resolveInvite(token)).toBeNull();
  });
});
