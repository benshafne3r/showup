import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getRealSessionUser } from "@/server/auth/guards";
import { isPlatformOwner } from "@/server/auth/owner-emails";
import { changeMemberRole, inviteMember, removeMember } from "@/server/services/companies";
import {
  changeAgencyMemberRole,
  inviteAgencyMember,
  removeAgencyMember,
  revokeAgencyInvite,
} from "@/server/services/agency-team";

/**
 * Owner-only team access while "viewing as" a label or management user. View
 * as blocks every server action, so these few team changes come here instead
 * (a plain POST, checked against the owner's real login) and are recorded as
 * the owner's. Nothing else can be changed while viewing.
 */

const target = { kind: z.enum(["label", "manager"]), orgId: z.string().uuid() };
const role = z.enum(["admin", "member"]);
const body = z.discriminatedUnion("op", [
  z.object({ op: z.literal("invite"), ...target, email: z.string().trim().email("Enter a valid email"), role }),
  z.object({ op: z.literal("role"), ...target, memberUserId: z.string().uuid(), role }),
  z.object({ op: z.literal("remove"), ...target, memberUserId: z.string().uuid() }),
  z.object({ op: z.literal("revoke"), kind: z.literal("manager"), orgId: z.string().uuid(), inviteId: z.string().uuid() }),
]);

export async function POST(request: NextRequest) {
  const owner = await getRealSessionUser();
  if (!owner || !isPlatformOwner(owner.email)) {
    return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  }
  // Same-site only (the session cookie is Lax, this is belt and braces).
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) {
    return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  }
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const input = parsed.data;
  const actor = { id: owner.id, role: "owner" };
  const label = input.kind === "label";

  let result: { ok: true } | { ok: false; error: string } = { ok: true };
  switch (input.op) {
    case "invite":
      result = label
        ? await inviteMember({ companyId: input.orgId, inviter: actor, email: input.email, role: input.role })
        : await inviteAgencyMember({ agencyId: input.orgId, inviter: actor, email: input.email, role: input.role });
      break;
    case "role":
      result = label
        ? await changeMemberRole({ companyId: input.orgId, actor, memberUserId: input.memberUserId, newRole: input.role })
        : await changeAgencyMemberRole({ agencyId: input.orgId, actor, memberUserId: input.memberUserId, newRole: input.role });
      break;
    case "remove":
      result = label
        ? await removeMember({ companyId: input.orgId, actor, memberUserId: input.memberUserId })
        : await removeAgencyMember({ agencyId: input.orgId, actor, memberUserId: input.memberUserId });
      break;
    case "revoke":
      await revokeAgencyInvite({ agencyId: input.orgId, actor, inviteId: input.inviteId });
      break;
  }
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, ...(input.op === "invite" ? { message: `Invite sent to ${input.email}` } : {}) });
}
