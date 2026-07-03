import type { Metadata } from "next";
import Link from "next/link";
import { requireLabelPage } from "../require-label";
import { serviceDb } from "@/server/db/service";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { formatDateTime } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { Film } from "lucide-react";

export const metadata: Metadata = { title: "Content review" };
export const dynamic = "force-dynamic";

export default async function ContentQueuePage() {
  const context = await requireLabelPage();
  const { data: submissions } = await serviceDb()
    .from("content_submissions")
    .select(
      `id, post_url, submitted_at, booking_id,
       users:users!creator_id(full_name),
       bookings!inner(creator_payment_cents, shows(artists(name), venues(city)))`,
    )
    .eq("company_id", context.companyId)
    .eq("status", "submitted")
    .order("submitted_at", { ascending: true });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Content review"
        description="Approve deliverables to release creator payments."
      />
      {!submissions?.length ? (
        <EmptyState
          icon={Film}
          title="Queue is clear"
          description="Submitted posts waiting for review will appear here."
        />
      ) : (
        <ul className="space-y-2">
          {submissions.map((submission) => (
            <li key={submission.id}>
              <Link
                href={`/label/bookings/${submission.booking_id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-4 text-sm transition-colors hover:border-primary/50"
              >
                <div className="min-w-0">
                  <p className="font-medium">{submission.users?.full_name ?? "Creator"}</p>
                  <p className="truncate text-muted-foreground">
                    {submission.bookings.shows?.artists?.name} · {submission.post_url}
                  </p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>{formatDateTime(submission.submitted_at)}</p>
                  <p className="font-medium text-emerald-300">
                    pays {formatCents(submission.bookings.creator_payment_cents)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
