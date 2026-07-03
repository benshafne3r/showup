import "server-only";

import { serviceDb } from "@/server/db/service";

export type AuditEntry = {
  actorId?: string | null;
  actorRole?: string;
  action: string; // e.g. "booking.approve_attendance"
  entityType: string;
  entityId?: string | null;
  companyId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
};

/**
 * Append-only audit trail for sensitive actions. Written inside the same
 * service call that performs the action. Failures are logged, never thrown —
 * an audit hiccup must not roll back a legitimate action that already
 * happened at the provider.
 */
export async function audit(entry: AuditEntry): Promise<void> {
  const { error } = await serviceDb().from("audit_logs").insert({
    actor_id: entry.actorId ?? null,
    actor_role: entry.actorRole ?? "system",
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId ?? null,
    company_id: entry.companyId ?? null,
    metadata: (entry.metadata ?? {}) as never,
    ip: entry.ip ?? null,
  });
  if (error) console.error("audit log write failed:", error.message, entry.action);
}
