import type { Metadata } from "next";
import Link from "next/link";
import { requireLabelPage } from "../require-label";
import { serviceDb } from "@/server/db/service";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { formatShowDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { CalendarPlus } from "lucide-react";
import type { ShowStatus } from "@/lib/statuses";

export const metadata: Metadata = { title: "Shows" };
export const dynamic = "force-dynamic";

const SHOW_STATUS_META: Record<ShowStatus, { label: string; tone: "neutral" | "info" | "success" | "warning" | "danger" }> = {
  draft: { label: "Draft", tone: "neutral" },
  published: { label: "Published", tone: "success" },
  canceled: { label: "Canceled", tone: "danger" },
  postponed: { label: "Postponed", tone: "warning" },
  completed: { label: "Completed", tone: "info" },
};

export default async function ShowsPage() {
  const context = await requireLabelPage();
  const { data: shows } = await serviceDb()
    .from("shows")
    .select(
      `id, date, status, artists(name), venues(name, city),
       show_opportunities(stated_ticket_value_cents, deposit_percentage, creator_payment_cents, tickets_total, tickets_claimed, published_at)`,
    )
    .eq("company_id", context.companyId)
    .order("date", { ascending: false });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Shows"
        description="Every date across your artists."
        action={
          <Button asChild>
            <Link href="/label/shows/new">
              <CalendarPlus className="size-4" aria-hidden /> New show
            </Link>
          </Button>
        }
      />
      {!shows?.length ? (
        <EmptyState
          icon={CalendarPlus}
          title="No shows yet"
          description="Create a show with an opportunity to start receiving creator requests."
          action={
            <Button asChild>
              <Link href="/label/shows/new">Create your first show</Link>
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground uppercase">
                <th scope="col" className="px-4 py-3 font-medium">Date</th>
                <th scope="col" className="px-4 py-3 font-medium">Artist</th>
                <th scope="col" className="px-4 py-3 font-medium">Venue</th>
                <th scope="col" className="px-4 py-3 font-medium">Tickets</th>
                <th scope="col" className="px-4 py-3 font-medium">Value / Deposit / Payment</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {shows.map((show) => {
                const opp = show.show_opportunities;
                return (
                  <tr key={show.id} className="border-b transition-colors last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Link href={`/label/shows/${show.id}`} className="font-medium hover:underline">
                        {formatShowDate(show.date)}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{show.artists?.name}</td>
                    <td className="px-4 py-3">
                      {show.venues?.name} · {show.venues?.city}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {opp ? `${opp.tickets_claimed}/${opp.tickets_total}` : "—"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {opp
                        ? `${formatCents(opp.stated_ticket_value_cents)} · ${opp.deposit_percentage}% · ${opp.creator_payment_cents > 0 ? formatCents(opp.creator_payment_cents) : "attend-only"}`
                        : "no opportunity"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge {...SHOW_STATUS_META[show.status]} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
