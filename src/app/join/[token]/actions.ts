"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireCreator } from "@/server/auth/guards";
import { resolveInvite } from "@/server/services/invites";
import { acceptRosterInvite } from "@/server/services/agencies";

/** An existing creator accepts a management company's roster invite. */
export async function acceptRosterInviteAction(formData: FormData): Promise<void> {
  const user = await requireCreator();
  const token = z.string().max(200).parse(formData.get("token"));
  const invite = await resolveInvite(token);
  if (invite?.kind !== "roster") redirect(`/join/${encodeURIComponent(token)}`);

  const result = await acceptRosterInvite({
    inviteId: invite.id,
    agencyId: invite.agencyId,
    creatorId: user.id,
  });
  if (!result.ok) {
    redirect(`/join/${encodeURIComponent(token)}?error=${encodeURIComponent(result.error)}`);
  }
  redirect("/creator/settings?joined=1");
}
