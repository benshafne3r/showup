"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getRealSessionUser } from "@/server/auth/guards";
import { isPlatformOwner } from "@/server/auth/owner-emails";
import { VIEW_AS_COOKIE, VIEWING_FLAG_COOKIE, viewAsCookieValue } from "@/server/auth/view-as";
import { serviceDb } from "@/server/db/service";
import { audit } from "@/server/services/audit";
import { createPartnerInvite, revokePartnerInvite } from "@/server/services/invites";
import { revalidatePath } from "next/cache";

const HOME_BY_ROLE: Record<string, string> = {
  creator: "/creator",
  label: "/label/tours",
  manager: "/manager",
  admin: "/admin",
};

/** Owner-only: start a read-only "view as" session for another user. */
export async function viewAsAction(formData: FormData): Promise<void> {
  const owner = await getRealSessionUser();
  if (!owner || !isPlatformOwner(owner.email)) redirect("/");
  const targetId = z.string().uuid().parse(formData.get("userId"));
  if (targetId === owner.id) redirect("/owner");

  const { data: target } = await serviceDb().from("users").select("id, role").eq("id", targetId).maybeSingle();
  if (!target) redirect("/owner");

  const { value, maxAge } = viewAsCookieValue(target.id, owner.id);
  const jar = await cookies();
  const base = { secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge };
  jar.set(VIEW_AS_COOKIE, value, { ...base, httpOnly: true });
  // Harmless flag the browser can read, so error pages can say "read-only"
  // instead of reporting the deliberately refused change.
  jar.set(VIEWING_FLAG_COOKIE, "1", base);
  await audit({
    actorId: owner.id,
    actorRole: "owner",
    action: "owner.view_as_start",
    entityType: "user",
    entityId: target.id,
  });
  redirect(HOME_BY_ROLE[target.role] ?? "/creator");
}

export type PartnerLinkState =
  | { error: string }
  | { link: string; kind: "label" | "manager"; orgName: string; email: string; expiresAt: string }
  | null;

const partnerSchema = z.object({
  kind: z.enum(["label", "manager"]),
  orgName: z.string().trim().max(120).optional().default(""),
  email: z.union([z.literal(""), z.string().trim().email("That email doesn't look right")]).optional().default(""),
});

/** Owner-only: make a private label / management sign-up link to send. */
export async function createPartnerLinkAction(_prev: PartnerLinkState, formData: FormData): Promise<PartnerLinkState> {
  const owner = await getRealSessionUser();
  if (!owner || !isPlatformOwner(owner.email)) return { error: "Owners only" };
  const parsed = partnerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    const { link, expiresAt } = await createPartnerInvite({
      kind: parsed.data.kind,
      orgName: parsed.data.orgName,
      email: parsed.data.email,
    });
    await audit({
      actorId: owner.id,
      actorRole: "owner",
      action: "partner_invite.create",
      entityType: "partner_invite",
      metadata: { kind: parsed.data.kind, orgName: parsed.data.orgName, email: parsed.data.email || null },
    });
    revalidatePath("/owner");
    return { link, kind: parsed.data.kind, orgName: parsed.data.orgName, email: parsed.data.email, expiresAt };
  } catch {
    return { error: "Couldn't create the link. Please try again." };
  }
}

/** Owner-only: kill an unused partner link. */
export async function revokePartnerLinkAction(formData: FormData): Promise<void> {
  const owner = await getRealSessionUser();
  if (!owner || !isPlatformOwner(owner.email)) redirect("/");
  await revokePartnerInvite(z.string().uuid().parse(formData.get("inviteId")));
  revalidatePath("/owner");
}
