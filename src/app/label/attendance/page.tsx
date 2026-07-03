import type { Metadata } from "next";
import Link from "next/link";
import { requireLabelPage } from "../require-label";
import { serviceDb } from "@/server/db/service";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { formatDateTime, formatShowDate } from "@/lib/dates";
import { ClipboardCheck } from "lucide-react";

export const metadata: Metadata = { title: "Attendance review" };
export const dynamic = "force-dynamic";

export default async function AttendanceQueuePage() {
  const context = await requireLabelPage();
  const { data: submissions } = await serviceDb()
    .from("attendance_submissions")
    .select(
      `id, checked_in_at, note, booking_id,
       users:users!creator_id(full_name),
       bookings!inner(id, shows(date, artists(name), venues(city)))`,
    )
    .eq("company_id", context.companyId)
    .eq("status", "submitted")
    .order("checked_in_at", { ascending: true });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance review"
        description="Verify check-ins to release creator holds."
      />
      {!submissions?.length ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Queue is clear"
          description="Creator check-ins waiting for verification will appear here."
        />
      ) : (
        <ul className="space-y-2">
          {submissions.map((submission) => (
            <li key={submission.id}>
              <Link
                href={`/label/bookings/${submission.booking_id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-4 text-sm transition-colors hover:border-primary/50"
              >
                <div>
                  <p className="font-medium">{submission.users?.full_name ?? "Creator"}</p>
                  <p className="text-muted-foreground">
                    {submission.bookings.shows?.artists?.name} ·{" "}
                    {submission.bookings.shows?.venues?.city} ·{" "}
                    {submission.bookings.shows?.date
                      ? formatShowDate(submission.bookings.shows.date)
                      : ""}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  checked in {formatDateTime(submission.checked_in_at)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
