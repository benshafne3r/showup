import "server-only";

import { readViewAs, realAuthUser } from "./view-as";
import { serviceDb } from "@/server/db/service";
import type { Database } from "@/lib/database.types";

type UserRow = Database["public"]["Tables"]["users"]["Row"];
type MemberRole = Database["public"]["Enums"]["company_member_role"];

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code: "unauthenticated" | "forbidden" | "suspended" = "forbidden",
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  role: UserRow["role"];
  status: UserRow["status"];
  avatarUrl: string | null;
  /** Set while the platform owner is viewing the app as this user (read-only). */
  viewedBy?: { id: string };
};

async function loadUser(id: string) {
  const { data } = await serviceDb()
    .from("users")
    .select("id, email, full_name, role, status, avatar_url")
    .eq("id", id)
    .maybeSingle();
  return data;
}

/**
 * Resolve the signed-in user from cookies, or null. While the platform owner
 * is "viewing as" someone, this is that person (with `viewedBy` set), so every
 * guard and page renders exactly what they'd see. Writes are blocked in proxy.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const viewAs = await readViewAs();
  if (viewAs) {
    const target = await loadUser(viewAs.targetId);
    if (target) {
      return {
        id: target.id,
        email: target.email,
        fullName: target.full_name,
        role: target.role,
        status: target.status,
        avatarUrl: target.avatar_url,
        viewedBy: { id: viewAs.ownerId },
      };
    }
  }
  return getRealSessionUser();
}

/** The real signed-in user, ignoring any "view as" (owner tools, auth). */
export async function getRealSessionUser(): Promise<SessionUser | null> {
  const user = await realAuthUser();
  if (!user) return null;
  const row = await loadUser(user.id);
  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    status: row.status,
    avatarUrl: row.avatar_url,
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError("Sign in required", "unauthenticated");
  if (user.status !== "active") throw new AuthError("Account suspended", "suspended");
  return user;
}

export async function requireCreator(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "creator") throw new AuthError("Creator account required");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") throw new AuthError("Admin access required");
  return user;
}

const ROLE_RANK: Record<MemberRole, number> = { member: 0, admin: 1, owner: 2 };

export type CompanyContext = {
  user: SessionUser;
  companyId: string;
  memberRole: MemberRole;
};

/**
 * Require that the current user is a member of `companyId` with at least
 * `minRole`. Admins pass with a synthetic "owner" role.
 */
export async function requireCompanyRole(
  companyId: string,
  minRole: MemberRole = "member",
): Promise<CompanyContext> {
  const user = await requireUser();
  if (user.role === "admin") {
    return { user, companyId, memberRole: "owner" };
  }
  const { data: membership } = await serviceDb()
    .from("company_members")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) throw new AuthError("Not a member of this company");
  if (ROLE_RANK[membership.role] < ROLE_RANK[minRole]) {
    throw new AuthError(`Requires company ${minRole} role`);
  }
  return { user, companyId, memberRole: membership.role };
}

/** The single company a label user belongs to (MVP: one company per user). */
export async function getMemberCompany(userId: string) {
  const { data } = await serviceDb()
    .from("company_members")
    .select("company_id, role, companies(id, name, kind, website, onboarded_at, verified_at, suspended_at)")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

/** Require label user with a company; returns the company context. */
export async function requireLabelWithCompany(): Promise<
  CompanyContext & { companyName: string }
> {
  const user = await requireUser();
  if (user.role !== "label" && user.role !== "admin") {
    throw new AuthError("Label account required");
  }
  const membership = await getMemberCompany(user.id);
  if (!membership?.companies) throw new AuthError("Company onboarding incomplete");
  if (membership.companies.suspended_at) throw new AuthError("Company suspended", "suspended");
  return {
    user,
    companyId: membership.company_id,
    memberRole: membership.role,
    companyName: membership.companies.name,
  };
}

export type AgencyContext = {
  user: SessionUser;
  agencyId: string;
  agencyName: string;
  memberRole: MemberRole;
};

/** Require a manager who belongs to a (non-suspended) management company. */
export async function requireManagerWithAgency(): Promise<AgencyContext> {
  const user = await requireUser();
  if (user.role !== "manager") throw new AuthError("Management account required");
  const { data: membership } = await serviceDb()
    .from("agency_members")
    .select("agency_id, role, agencies(name, suspended_at)")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership?.agencies) throw new AuthError("Management onboarding incomplete");
  if (membership.agencies.suspended_at) throw new AuthError("Management company suspended", "suspended");
  return {
    user,
    agencyId: membership.agency_id,
    agencyName: membership.agencies.name,
    memberRole: membership.role,
  };
}

/** Require a manager whose agency represents `creatorId`. */
export async function requireManagerOf(creatorId: string): Promise<AgencyContext> {
  const ctx = await requireManagerWithAgency();
  const { data: link } = await serviceDb()
    .from("agency_creators")
    .select("id")
    .eq("agency_id", ctx.agencyId)
    .eq("creator_id", creatorId)
    .maybeSingle();
  if (!link) throw new AuthError("That creator isn't on your roster");
  return ctx;
}
