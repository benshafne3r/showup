import "server-only";

import { userDb } from "@/server/db/server-client";
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
};

/** Resolve the signed-in user from cookies, or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const db = await userDb();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return null;

  const { data: row } = await serviceDb()
    .from("users")
    .select("id, email, full_name, role, status, avatar_url")
    .eq("id", user.id)
    .maybeSingle();
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
