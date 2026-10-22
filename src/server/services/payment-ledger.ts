import "server-only";

import type { PostgrestError } from "@supabase/supabase-js";
import { serviceDb } from "@/server/db/service";

/**
 * payment_operations: one row per provider call (authorize / release /
 * capture / payout / void), keyed by its idempotency key. A row stays
 * 'started' until the record it acts on has its final state written; a
 * 'started' row whose lease expired means the process died mid-call, and
 * recovery (payment-recovery.ts) asks the provider what happened.
 */

export const LEASE_SECONDS = 120;
export type OperationKind = "authorize" | "release" | "capture" | "payout" | "void";
export type Actor = { id: string | null; role: string };

export const leaseUntil = (now = new Date()) => new Date(now.getTime() + LEASE_SECONDS * 1000).toISOString();

/** Throw on a failed critical write instead of carrying on with stale state. */
export function check<T>(res: { data: T; error: PostgrestError | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

export async function startOperation(input: {
  kind: OperationKind;
  idempotencyKey: string;
  authorizationRecordId?: string;
  paymentRecordId?: string;
  actor?: Actor;
}): Promise<{ id: string }> {
  const db = serviceDb();
  const inserted = await db
    .from("payment_operations")
    .insert({
      kind: input.kind,
      idempotency_key: input.idempotencyKey,
      authorization_record_id: input.authorizationRecordId ?? null,
      payment_record_id: input.paymentRecordId ?? null,
      lease_until: leaseUntil(),
      actor_id: input.actor?.id ?? null,
      actor_role: input.actor?.role ?? "system",
    })
    .select("id")
    .single();
  if (!inserted.error) return inserted.data;
  if (inserted.error.code !== "23505") throw new Error(`start payment operation: ${inserted.error.message}`);

  // Same key already recorded: this is a resumed attempt (recovery replay).
  const existing = check(
    await db.from("payment_operations").select("id, attempts").eq("idempotency_key", input.idempotencyKey).single(),
    "load payment operation",
  )!;
  check(
    await db
      .from("payment_operations")
      .update({ status: "started", attempts: existing.attempts + 1, lease_until: leaseUntil(), finished_at: null })
      .eq("id", existing.id),
    "resume payment operation",
  );
  return { id: existing.id };
}

export async function finishOperation(
  id: string,
  outcome: { status: "succeeded" | "failed"; providerRef?: string | null; error?: string | null },
): Promise<void> {
  check(
    await serviceDb()
      .from("payment_operations")
      .update({
        status: outcome.status,
        provider_ref: outcome.providerRef ?? null,
        last_error: outcome.error ?? null,
        finished_at: new Date().toISOString(),
      })
      .eq("id", id),
    "finish payment operation",
  );
}

/** Latest operation of a kind for a record (to resume or reconcile it). */
export async function latestOperation(
  kind: OperationKind,
  target: { authorizationRecordId?: string; paymentRecordId?: string; idempotencyKey?: string | null },
) {
  let query = serviceDb()
    .from("payment_operations")
    .select("id, kind, idempotency_key, status, provider_ref, created_at, lease_until")
    .eq("kind", kind);
  if (target.idempotencyKey) query = query.eq("idempotency_key", target.idempotencyKey);
  if (target.authorizationRecordId) query = query.eq("authorization_record_id", target.authorizationRecordId);
  if (target.paymentRecordId) query = query.eq("payment_record_id", target.paymentRecordId);
  return check(await query.order("created_at", { ascending: false }).limit(1).maybeSingle(), "load payment operation");
}

/** Number of operations of a kind already run for a record (for per-attempt keys). */
export async function operationCount(kind: OperationKind, authorizationRecordId: string): Promise<number> {
  const res = await serviceDb()
    .from("payment_operations")
    .select("id", { count: "exact", head: true })
    .eq("kind", kind)
    .eq("authorization_record_id", authorizationRecordId);
  if (res.error) throw new Error(`count payment operations: ${res.error.message}`);
  return res.count ?? 0;
}
