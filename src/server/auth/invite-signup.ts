import "server-only";

import { claimPartnerInvite, setUserRole, type ResolvedInvite } from "@/server/services/invites";
import { log } from "@/server/log";

/**
 * Apply a vetted invite to a brand-new account: promote its role. Teammates
 * are attached to their company by email match on first landing via
 * `destinationFor` (`claimInvites` for labels, `claimAgencyInvites` for
 * management).
 */
export async function applyInviteToNewUser(invite: ResolvedInvite, userId: string): Promise<void> {
  if (invite.kind === "partner") {
    if (await claimPartnerInvite(invite.id, userId)) {
      await setUserRole(userId, invite.role);
    } else {
      log.warn("Partner invite was already used", { inviteId: invite.id, userId });
    }
    return;
  }
  await setUserRole(userId, invite.kind === "agency_team" ? "manager" : "label");
}
