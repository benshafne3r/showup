import "server-only";

import { claimPartnerInvite, setUserRole, type ResolvedInvite } from "@/server/services/invites";
import { log } from "@/server/log";

/**
 * Apply a vetted invite to a brand-new account: promote its role. Label
 * teammates are attached to their company by `claimInvites` (email match) on
 * first landing via `destinationFor`.
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
  // A label teammate.
  await setUserRole(userId, "label");
}
