import type { Metadata } from "next";
import { requireAdmin } from "@/server/auth/guards";
import { serviceDb } from "@/server/db/service";
import { PageHeader } from "@/components/page-header";
import { formatShowDate } from "@/lib/dates";
import { StatusBadge } from "@/components/status-badge";
import { AdminCancelShow } from "./cancel-show";

export const metadata: Metadata = { title: "Shows" };
export const dynamic = "force-dynamic";

const TONE: Record<string, "neutral" | "info" | "success" | "warning" | "danger"> = {
  draft: "neutral",
  published: "success",
  canceled: "danger",
  postponed: "warning",
  completed: "info",
};

export default async function AdminShowsPage() {
  await requireAdmin();
  const { data: shows } = await serviceDb()
    .from("shows")
    .select(
      `id, date, status, artists(name), venues(name, city), companies(name),
       show_opportunities(tickets_total, tickets_claimed), bookings(id)`,
    )
    .order("date", { ascending: false })
    .limit(200);

  return (
    <div className="space-y-6">
      <PageHeader title="Shows" description="Every show across every company." />
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground uppercase">
              <th scope="col" className="px-4 py-3 font-medium">Date</th>
              <th scope="col" className="px-4 py-3 font-medium">Artist</th>
              <th scope="col" className="px-4 py-3 font-medium">Company</th>
              <th scope="col" className="px-4 py-3 font-medium">Venue</th>
              <th scope="col" className="px-4 py-3 font-medium">Tickets</th>
              <th scope="col" className="px-4 py-3 font-medium">Bookings</th>
              <th scope="col" className="px-4 py-3 font-medium">Status</th>
              <th scope="col" className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(shows ?? []).map((show) => {
              const opp = show.show_opportunities;
              return (
                <tr key={show.id} className="border-b last:border-0">
                  <td className="px-4 py-3 whitespace-nowrap">{formatShowDate(show.date)}</td>
                  <td className="px-4 py-3">{show.artists?.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{show.companies?.name}</td>
                  <td className="px-4 py-3">
                    {show.venues?.name} · {show.venues?.city}
                  </td>
                  <td className="px-4 py-3">
                    {opp ? `${opp.tickets_claimed}/${opp.tickets_total}` : "—"}
                  </td>
                  <td className="px-4 py-3">{show.bookings?.length ?? 0}</td>
                  <td className="px-4 py-3">
                    <StatusBadge label={show.status} tone={TONE[show.status] ?? "neutral"} />
                  </td>
                  <td className="px-4 py-3">
                    {["draft", "published", "postponed"].includes(show.status) ? (
                      <AdminCancelShow showId={show.id} />
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
