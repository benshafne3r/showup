import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { serviceDb } from "@/server/db/service";
import { audit } from "./audit";

/**
 * Invite links (`/join/<token>`) are the only way to get a non-creator
 * account. Three kinds resolve through the same URL:
 *   - partner: a private label / management sign-up link minted by the
 *     platform owner (scripts/partner-invite.ts)
 *   - team:    a label teammate invite (company_invites)
 *   - roster:  a management company inviting a creator onto its roster
 * Partner + roster tokens are stored hashed; team tokens predate that and are
 * stored as-is (random 24 bytes either way).
 */

export type ResolvedInvite =
  | {
      kind: "partner";
      id: string;
      role: "label" | "manager";
      email: string | null;
      orgName: string;
    }
  | { kind: "team"; id: string; companyId: string; companyName: string; email: string }
  | {
      kind: "roster";
      id: string;
      agencyId: string;
      agencyName: string;
      email: string;
      fullName: string;
    };

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{20,128}$/;

export function newInviteToken(): { token: string; hash: string } {
  const token = randomBytes(24).toString("base64url");
  return { token, hash: hashInviteToken(token) };
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function resolveInvite(token: string): Promise<ResolvedInvite | null> {
  if (!TOKEN_SHAPE.test(token)) return null;
  const db = serviceDb();
  const now = new Date().toISOString();
  const hash = hashInviteToken(token);

  const { data: partner } = await db
    .from("partner_invites")
    .select("id, kind, email, org_name")
    .eq("token_hash", hash)
    .is("used_at", null)
    .is("revoked_at", null)
    .gt("expires_at", now)
    .maybeSingle();
  if (partner) {
    return {
      kind: "partner",
      id: partner.id,
      role: partner.kind as "label" | "manager",
      email: partner.email,
      orgName: partner.org_name,
    };
  }

  const { data: roster } = await db
    .from("agency_invites")
    .select("id, agency_id, email, full_name, agencies(name, suspended_at)")
    .eq("token_hash", hash)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", now)
    .maybeSingle();
  if (roster?.agencies && !roster.agencies.suspended_at) {
    return {
      kind: "roster",
      id: roster.id,
      agencyId: roster.agency_id,
      agencyName: roster.agencies.name,
      email: roster.email,
      fullName: roster.full_name,
    };
  }

  const { data: team } = await db
    .from("company_invites")
    .select("id, company_id, email, companies(name)")
    .eq("token", token)
    .is("accepted_at", null)
    .gt("expires_at", now)
    .maybeSingle();
  if (team) {
    return {
      kind: "team",
      id: team.id,
      companyId: team.company_id,
      companyName: team.companies?.name ?? "a team",
      email: team.email,
    };
  }
  return null;
}

/** Role an account created from this invite should have. */
export function roleForInvite(invite: ResolvedInvite): "creator" | "label" | "manager" {
  if (invite.kind === "partner") return invite.role;
  if (invite.kind === "team") return "label";
  return "creator";
}

/**
 * Promote a user's role. A DB trigger mirrors it into the auth user's
 * app_metadata (which the proxy reads and users can't edit).
 */
export async function setUserRole(userId: string, role: "creator" | "label" | "manager") {
  const { error } = await serviceDb().from("users").update({ role }).eq("id", userId);
  if (error) throw new Error(`Could not set role: ${error.message}`);
}

/**
 * Consume a partner invite for a freshly created account. The guarded UPDATE
 * makes the link strictly single-use even under concurrent sign-ups.
 */
export async function claimPartnerInvite(inviteId: string, userId: string): Promise<boolean> {
  const { data } = await serviceDb()
    .from("partner_invites")
    .update({ used_at: new Date().toISOString(), used_by: userId })
    .eq("id", inviteId)
    .is("used_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("id, kind")
    .maybeSingle();
  if (!data) return false;
  await audit({
    actorId: userId,
    actorRole: data.kind,
    action: "partner_invite.claim",
    entityType: "partner_invite",
    entityId: data.id,
  });
  return true;
}

/** Org name pre-filled from the partner invite this user signed up with. */
export async function partnerInviteOrgName(userId: string): Promise<string> {
  const { data } = await serviceDb()
    .from("partner_invites")
    .select("org_name")
    .eq("used_by", userId)
    .order("used_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.org_name ?? "";
}

/**
 * Mint a private, single-use partner sign-up link (label or management).
 * Same as `npm run invite`, for the owner dashboard. Returns the link once.
 */
export async function createPartnerInvite(input: {
  kind: "label" | "manager";
  orgName?: string;
  email?: string;
  days?: number;
}): Promise<{ link: string; expiresAt: string }> {
  const { token, hash } = newInviteToken();
  const expiresAt = new Date(Date.now() + (input.days ?? 14) * 86_400_000).toISOString();
  const { error } = await serviceDb()
    .from("partner_invites")
    .insert({
      kind: input.kind,
      org_name: input.orgName?.trim() ?? "",
      email: input.email?.trim().toLowerCase() || null,
      token_hash: hash,
      expires_at: expiresAt,
      note: "owner dashboard",
    });
  if (error) throw new Error(`Couldn't create the link: ${error.message}`);
  const { publicEnv } = await import("@/lib/env");
  return { link: `${publicEnv.appUrl}/join/${token}`, expiresAt };
}

export async function revokePartnerInvite(id: string): Promise<void> {
  await serviceDb()
    .from("partner_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .is("used_at", null)
    .is("revoked_at", null);
}
