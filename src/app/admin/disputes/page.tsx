import type { Metadata } from "next";
import { requireAdmin } from "@/server/auth/guards";
import { serviceDb } from "@/server/db/service";
import { signedFileUrls } from "@/server/services/uploads";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { BOOKING_STATUS_META } from "@/lib/statuses";
import { formatCents } from "@/lib/money";
import { formatDateTime, formatShowDate } from "@/lib/dates";
import { ResolveDisputeForm } from "./resolve-form";
import { Scale } from "lucide-react";

export const metadata: Metadata = { title: "Disputes" };
export const dynamic = "force-dynamic";

export default async function AdminDisputesPage() {
  await requireAdmin();
  const db = serviceDb();

  const { data: disputes } = await db
    .from("disputes")
    .select(
      `id, kind, status, reason, evidence_paths, resolution, created_at, resolved_at,
       opened_by, booking_id,
       users:users!creator_id(full_name),
       companies(name),
       bookings!inner(
         id, status, authorization_amount_cents, creator_payment_cents,
         attendance_state, content_state,
         shows(date, artists(name), venues(name, city))
       )`,
    )
    .order("created_at", { ascending: false })
    .limit(50);

  const open = (disputes ?? []).filter((d) => ["open", "under_review"].includes(d.status));
  const resolved = (disputes ?? []).filter((d) => !["open", "under_review"].includes(d.status));

  const withEvidence = await Promise.all(
    open.map(async (dispute) => ({
      ...dispute,
      evidenceUrls: await signedFileUrls("proofs", dispute.evidence_paths),
    })),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Disputes"
        description="Money movement on a disputed booking is frozen until you resolve it."
      />

      {withEvidence.length === 0 ? (
        <EmptyState icon={Scale} title="No open disputes" description="All clear." />
      ) : (
        withEvidence.map((dispute) => {
          const booking = dispute.bookings;
          return (
            <Card key={dispute.id} className="border-amber-500/30">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                  <span>
                    {dispute.kind.toUpperCase()} dispute — {dispute.users?.full_name} vs{" "}
                    {dispute.companies?.name}
                  </span>
                  <StatusBadge label={dispute.status} tone="warning" />
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-6 lg:grid-cols-[1fr_320px]">
                <div className="space-y-3 text-sm">
                  <p className="text-muted-foreground">
                    {booking.shows?.artists?.name} · {booking.shows?.venues?.name},{" "}
                    {booking.shows?.venues?.city} ·{" "}
                    {booking.shows?.date ? formatShowDate(booking.shows.date) : ""} · opened{" "}
                    {formatDateTime(dispute.created_at)}
                  </p>
                  <div className="flex flex-wrap gap-4 text-xs">
                    <span>
                      Booking: <StatusBadge {...BOOKING_STATUS_META[booking.status]} />
                    </span>
                    <span className="text-muted-foreground">
                      Hold {formatCents(booking.authorization_amount_cents)} · payment{" "}
                      {booking.creator_payment_cents > 0
                        ? formatCents(booking.creator_payment_cents)
                        : "—"}{" "}
                      · attendance {booking.attendance_state} · content {booking.content_state}
                    </span>
                  </div>
                  <blockquote className="rounded-lg border-l-2 border-amber-500/60 bg-muted/40 px-4 py-3">
                    “{dispute.reason}”
                  </blockquote>
                  {dispute.evidenceUrls.length ? (
                    <div className="flex flex-wrap gap-2">
                      {dispute.evidenceUrls.map((evidence, index) =>
                        evidence.url ? (
                          <a key={index} href={evidence.url} target="_blank" rel="noreferrer">
                            <img
                              src={evidence.url}
                              alt={`Dispute evidence ${index + 1}`}
                              className="h-24 w-auto rounded-md border object-cover"
                            />
                          </a>
                        ) : null,
                      )}
                    </div>
                  ) : null}
                </div>
                <ResolveDisputeForm disputeId={dispute.id} kind={dispute.kind} />
              </CardContent>
            </Card>
          );
        })
      )}

      {resolved.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            Resolved
          </h2>
          <ul className="space-y-2 text-sm">
            {resolved.map((dispute) => (
              <li key={dispute.id} className="rounded-lg border bg-card px-4 py-3">
                <p className="font-medium">
                  {dispute.kind} — {dispute.users?.full_name} vs {dispute.companies?.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {dispute.resolution} · resolved{" "}
                  {dispute.resolved_at ? formatDateTime(dispute.resolved_at) : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
