import "server-only";

import { serviceDb } from "@/server/db/service";
import { audit } from "./audit";
import { getPlatformSettings } from "./settings";
import type { Database } from "@/lib/database.types";

type DeliverablePlatform = Database["public"]["Enums"]["deliverable_platform"];

export type DeliverableInput = {
  platform: DeliverablePlatform;
  quantity: number;
  description: string;
};

/**
 * One opportunity per show. The deposit percentage must match one of the
 * platform's active templates — arbitrary flat fees are not allowed.
 */
export async function upsertOpportunity(input: {
  companyId: string;
  actor: { id: string; role: string };
  showId: string;
  statedTicketValueCents: number;
  depositPercentage: number;
  creatorPaymentCents: number;
  plusOneAllowed: boolean;
  ticketsTotal: number;
  applicationDeadline: string; // ISO
  contentDeadlineDays?: number;
  notes?: string;
  deliverables: DeliverableInput[];
  publish: boolean;
}): Promise<{ ok: true; opportunityId: string } | { ok: false; error: string }> {
  const db = serviceDb();

  const settings = await getPlatformSettings();
  if (!settings.depositPercentageTemplates.includes(input.depositPercentage)) {
    return {
      ok: false,
      error: `Deposit percentage must be one of the platform templates: ${settings.depositPercentageTemplates.join("%, ")}%`,
    };
  }

  const { data: show } = await db
    .from("shows")
    .select("id, status, company_id")
    .eq("id", input.showId)
    .eq("company_id", input.companyId)
    .maybeSingle();
  if (!show) return { ok: false, error: "Show not found" };
  if (["canceled", "completed"].includes(show.status)) {
    return { ok: false, error: "This show can no longer be edited" };
  }

  const { data: existing } = await db
    .from("show_opportunities")
    .select("id, tickets_claimed, published_at")
    .eq("show_id", input.showId)
    .maybeSingle();

  if (existing && input.ticketsTotal < existing.tickets_claimed) {
    return {
      ok: false,
      error: `Ticket count cannot go below the ${existing.tickets_claimed} already claimed`,
    };
  }

  const values = {
    show_id: input.showId,
    company_id: input.companyId,
    stated_ticket_value_cents: input.statedTicketValueCents,
    deposit_percentage: input.depositPercentage,
    creator_payment_cents: input.creatorPaymentCents,
    plus_one_allowed: input.plusOneAllowed,
    tickets_total: input.ticketsTotal,
    application_deadline: input.applicationDeadline,
    content_deadline_days: input.contentDeadlineDays ?? settings.contentDeadlineDefaultDays,
    notes: input.notes ?? "",
  };

  let opportunityId: string;
  if (existing) {
    const { error } = await db
      .from("show_opportunities")
      .update({
        ...values,
        published_at: input.publish
          ? (existing.published_at ?? new Date().toISOString())
          : existing.published_at,
      })
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
    opportunityId = existing.id;
  } else {
    const { data, error } = await db
      .from("show_opportunities")
      .insert({
        ...values,
        published_at: input.publish ? new Date().toISOString() : null,
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    opportunityId = data.id;
  }

  // Replace deliverables wholesale (simple + predictable for the MVP;
  // bookings snapshot their terms so history is unaffected).
  await db.from("deliverable_requirements").delete().eq("opportunity_id", opportunityId);
  if (input.deliverables.length > 0) {
    await db.from("deliverable_requirements").insert(
      input.deliverables.map((d) => ({
        opportunity_id: opportunityId,
        platform: d.platform,
        quantity: d.quantity,
        description: d.description,
      })),
    );
  }

  if (input.publish) {
    await db
      .from("shows")
      .update({ status: "published" })
      .eq("id", input.showId)
      .eq("status", "draft");
  }

  await audit({
    actorId: input.actor.id,
    actorRole: input.actor.role,
    action: existing ? "opportunity.update" : "opportunity.create",
    entityType: "show_opportunity",
    entityId: opportunityId,
    companyId: input.companyId,
    metadata: {
      statedTicketValueCents: input.statedTicketValueCents,
      depositPercentage: input.depositPercentage,
      creatorPaymentCents: input.creatorPaymentCents,
      ticketsTotal: input.ticketsTotal,
      published: input.publish,
    },
  });
  return { ok: true, opportunityId };
}
