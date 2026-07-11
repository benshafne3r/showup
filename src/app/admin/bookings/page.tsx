import type { Metadata } from "next";
import { requireAdmin } from "@/server/auth/guards";
import { serviceDb } from "@/server/db/service";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { BOOKING_STATUS_META } from "@/lib/statuses";
import { formatShowDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { AdminCancelBooking } from "./cancel-booking";

export const metadata: Metadata = { title: "Bookings" };
export const dynamic = "force-dynamic";

export default async function AdminBookingsPage() {
  await requireAdmin();
  const { data: bookings } = await serviceDb()
    .from("bookings")
    .select(
      `id, status, ticket_count, authorization_amount_cents, creator_payment_cents,
       attendance_state, content_state, created_at,
       users:users!creator_id(full_name, email),
       companies(name),
       shows(date, artists(name), venues(city))`,
    )
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <div className="space-y-6">
      <PageHeader title="Bookings" description="Every booking across the platform." />
      <div className="hidden overflow-x-auto rounded-xl border md:block">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground uppercase">
              <th scope="col" className="px-4 py-3 font-medium">Creator</th>
              <th scope="col" className="px-4 py-3 font-medium">Show</th>
              <th scope="col" className="px-4 py-3 font-medium">Company</th>
              <th scope="col" className="px-4 py-3 font-medium">Hold</th>
              <th scope="col" className="px-4 py-3 font-medium">Payment</th>
              <th scope="col" className="px-4 py-3 font-medium">Status</th>
              <th scope="col" className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(bookings ?? []).map((booking) => (
              <tr key={booking.id} className="border-b last:border-0">
                <td className="px-4 py-3">
                  <p className="font-medium">{booking.users?.full_name}</p>
                  <p className="text-xs text-muted-foreground">{booking.users?.email}</p>
                </td>
                <td className="px-4 py-3">
                  {booking.shows?.artists?.name} · {booking.shows?.venues?.city}
                  <span className="block text-xs text-muted-foreground">
                    {booking.shows?.date ? formatShowDate(booking.shows.date) : ""} ·{" "}
                    {booking.ticket_count} tix
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{booking.companies?.name}</td>
                <td className="px-4 py-3">{formatCents(booking.authorization_amount_cents)}</td>
                <td className="px-4 py-3">
                  {booking.creator_payment_cents > 0 ? formatCents(booking.creator_payment_cents) : "—"}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge {...BOOKING_STATUS_META[booking.status]} />
                </td>
                <td className="px-4 py-3">
                  {[
                    "awaiting_acceptance",
                    "awaiting_payment_method",
                    "confirmed",
                    "authorization_failed",
                    "no_show_review",
                    "disputed",
                  ].includes(booking.status) ? (
                    <AdminCancelBooking bookingId={booking.id} />
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: stacked cards */}
      <ul className="space-y-3 md:hidden">
        {(bookings ?? []).map((booking) => (
          <li key={booking.id} className="rounded-xl border p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{booking.users?.full_name}</p>
                <p className="truncate text-xs text-muted-foreground">{booking.users?.email}</p>
              </div>
              <StatusBadge {...BOOKING_STATUS_META[booking.status]} />
            </div>
            <p className="mt-2 text-sm">
              {booking.shows?.artists?.name} · {booking.shows?.venues?.city}
            </p>
            <p className="text-xs text-muted-foreground">
              {booking.shows?.date ? formatShowDate(booking.shows.date) : ""} · {booking.ticket_count} tix
              {booking.companies?.name ? ` · ${booking.companies.name}` : ""}
            </p>
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Hold</dt>
                <dd>{formatCents(booking.authorization_amount_cents)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Payment</dt>
                <dd>
                  {booking.creator_payment_cents > 0 ? formatCents(booking.creator_payment_cents) : "—"}
                </dd>
              </div>
            </dl>
            {[
              "awaiting_acceptance",
              "awaiting_payment_method",
              "confirmed",
              "authorization_failed",
              "no_show_review",
              "disputed",
            ].includes(booking.status) ? (
              <div className="mt-3 border-t pt-3">
                <AdminCancelBooking bookingId={booking.id} />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
