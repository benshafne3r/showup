import "server-only";

import { claimPartnerInvite, setUserRole, type ResolvedInvite } from "@/server/services/invites";
import { acceptRosterInvite } from "@/server/services/agencies";
import { log } from "@/server/log";

/**
 * Apply a vetted invite to a brand-new account: promote its role, or put it
 * on a management roster. Label teammates are attached to their company by
 * `claimInvites` (email match) on first landing via `destinationFor`.
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
  if (invite.kind === "team") {
    await setUserRole(userId, "label");
    return;
  }
  const result = await acceptRosterInvite({
    inviteId: invite.id,
    agencyId: invite.agencyId,
    creatorId: userId,
  });
  if (!result.ok) {
    log.warn("Roster invite not applied at sign-up", { inviteId: invite.id, userId, error: result.error });
  }
}
