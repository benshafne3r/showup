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
 * One opportunity per show. Labels set a deposit per ticket, stored as the
 * stated value at 100% so the hold math (value × tickets × %) is unchanged.
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
  const depositCents = Math.round((input.statedTicketValueCents * input.depositPercentage) / 100);
  // Stripe can't hold less than $0.50; keep holds in a sane range.
  if (depositCents < 100 || depositCents > 200_000) {
    return { ok: false, error: "Set a deposit between $1 and $2,000 per ticket" };
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

/**
 * Set one deposit per ticket on every editable show of a tour (published or
 * draft, not canceled/completed). Confirmed bookings keep the terms they
 * agreed to: bookings snapshot their own deposit at approval.
 */
export async function setTourDeposit(input: {
  companyId: string;
  actor: { id: string; role: string };
  tourId: string;
  depositCents: number;
}): Promise<{ ok: true; updated: number } | { ok: false; error: string }> {
  if (input.depositCents < 100 || input.depositCents > 200_000) {
    return { ok: false, error: "Set a deposit between $1 and $2,000 per ticket" };
  }
  const db = serviceDb();
  const { data: shows } = await db
    .from("shows")
    .select("id")
    .eq("company_id", input.companyId)
    .eq("tour_id", input.tourId)
    .not("status", "in", "(canceled,completed)");
  const showIds = (shows ?? []).map((s) => s.id);
  if (!showIds.length) return { ok: true, updated: 0 };

  const { data: updated, error } = await db
    .from("show_opportunities")
    .update({ stated_ticket_value_cents: input.depositCents, deposit_percentage: 100 })
    .eq("company_id", input.companyId)
    .in("show_id", showIds)
    .select("id");
  if (error) return { ok: false, error: error.message };

  await audit({
    actorId: input.actor.id,
    actorRole: input.actor.role,
    action: "tour.set_deposit",
    entityType: "tour",
    entityId: input.tourId,
    companyId: input.companyId,
    metadata: { depositCents: input.depositCents, shows: updated?.length ?? 0 },
  });
  return { ok: true, updated: updated?.length ?? 0 };
}
