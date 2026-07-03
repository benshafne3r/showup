import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireLabelPage } from "../../../require-label";
import { serviceDb } from "@/server/db/service";
import { getPlatformSettings } from "@/server/services/settings";
import { PageHeader } from "@/components/page-header";
import { ShowForm } from "../../show-form";
import { formatCents } from "@/lib/money";

export const metadata: Metadata = { title: "Edit show" };
export const dynamic = "force-dynamic";

function centsToDollarString(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

export default async function EditShowPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireLabelPage();
  const { id } = await params;
  const db = serviceDb();

  const [{ data: show }, { data: artists }, { data: tours }, settings] = await Promise.all([
    db
      .from("shows")
      .select(
        `id, artist_id, tour_id, date, doors_time, start_time, status, ticket_delivery_method,
         venues(name, city, state, address),
         show_opportunities(
           id, stated_ticket_value_cents, deposit_percentage, creator_payment_cents,
           plus_one_allowed, tickets_total, application_deadline, content_deadline_days,
           notes, published_at,
           deliverable_requirements(platform, quantity, description)
         )`,
      )
      .eq("id", id)
      .eq("company_id", context.companyId)
      .maybeSingle(),
    db.from("artists").select("id, name").eq("company_id", context.companyId).order("name"),
    db.from("tours").select("id, name, artist_id").eq("company_id", context.companyId).order("name"),
    getPlatformSettings(),
  ]);
  if (!show) notFound();

  const opp = show.show_opportunities;
  const templates = settings.depositPercentageTemplates.includes(opp?.deposit_percentage ?? -1)
    ? settings.depositPercentageTemplates
    : [...settings.depositPercentageTemplates, ...(opp ? [opp.deposit_percentage] : [])].sort((a, b) => a - b);

  const bookedNote =
    opp && opp.published_at
      ? "Heads up: edits never change already-confirmed bookings — their terms were snapshotted at approval."
      : undefined;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Edit show" description={bookedNote} />
      <ShowForm
        artists={artists ?? []}
        tours={(tours ?? []).map((t) => ({ id: t.id, name: t.name, artistId: t.artist_id }))}
        depositTemplates={templates}
        initial={{
          showId: show.id,
          artistId: show.artist_id,
          tourId: show.tour_id ?? undefined,
          venueName: show.venues?.name,
          venueCity: show.venues?.city,
          venueState: show.venues?.state ?? "",
          venueAddress: show.venues?.address ?? "",
          date: show.date,
          doorsTime: show.doors_time?.slice(0, 5) ?? "",
          startTime: show.start_time?.slice(0, 5) ?? "",
          ticketDeliveryMethod: show.ticket_delivery_method,
          statedTicketValue: opp ? centsToDollarString(opp.stated_ticket_value_cents) : "",
          depositPercentage: opp?.deposit_percentage,
          creatorPayment: opp && opp.creator_payment_cents > 0 ? centsToDollarString(opp.creator_payment_cents) : "",
          plusOneAllowed: opp?.plus_one_allowed ?? true,
          ticketsTotal: opp?.tickets_total,
          applicationDeadline: opp
            ? new Date(opp.application_deadline).toISOString().slice(0, 16)
            : "",
          contentDeadlineDays: opp?.content_deadline_days ?? settings.contentDeadlineDefaultDays,
          notes: opp?.notes ?? "",
          deliverables: (opp?.deliverable_requirements ?? []).map((d) => ({
            platform: d.platform,
            quantity: d.quantity,
            description: d.description,
          })),
          isPublished: !!opp?.published_at,
        }}
      />
      {opp ? (
        <p className="text-xs text-muted-foreground">
          Current terms: {formatCents(opp.stated_ticket_value_cents)} value · {opp.deposit_percentage}% deposit ·{" "}
          {opp.creator_payment_cents > 0 ? `${formatCents(opp.creator_payment_cents)} creator payment` : "attend-only"}.
        </p>
      ) : null}
    </div>
  );
}
