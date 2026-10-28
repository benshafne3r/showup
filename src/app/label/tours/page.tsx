import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { requireLabelPage } from "../require-label";
import { serviceDb } from "@/server/db/service";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { CreateDialog } from "./create-dialog";
import { TourEditDialog } from "./tour-edit-dialog";
import { DeleteTourButton } from "./delete-tour-button";
import { ShareButton } from "./share-button";
import { DeleteShowButton } from "../shows/delete-show-button";
import { formatShowDate } from "@/lib/dates";
import { depositPerTicketCents, formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { CalendarArrowDown, CalendarPlus, Pencil, Route } from "lucide-react";

export const metadata: Metadata = { title: "Shows" };

type OppTerms = { stated_ticket_value_cents: number; deposit_percentage: number };
const depositOf = (o: OppTerms) => depositPerTicketCents(o.stated_ticket_value_cents, o.deposit_percentage);
const dollars = (cents: number) => (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2));

/** What the Edit popup says about the tour's current deposit. */
function tourDepositSummary(
  shows: Array<{ status: string; show_opportunities: OppTerms | null }>,
): { uniform: string | null; summary: string } {
  const amounts = shows
    .filter((s) => !["canceled", "completed"].includes(s.status) && s.show_opportunities)
    .map((s) => depositOf(s.show_opportunities!));
  if (!amounts.length) return { uniform: null, summary: "No upcoming dates yet." };
  const min = Math.min(...amounts);
  const max = Math.max(...amounts);
  if (min === max) {
    return {
      uniform: dollars(min),
      summary: `Currently ${formatCents(min)} on ${amounts.length === 1 ? "the 1 upcoming date" : `all ${amounts.length} upcoming dates`}.`,
    };
  }
  return { uniform: null, summary: `Currently varies (${formatCents(min)} to ${formatCents(max)}).` };
}
export const dynamic = "force-dynamic";

type View = "active" | "past" | "all";

/** "15 shows", or "1 upcoming of 15 shows" when the view hides some. */
function showCount(shown: number, total: number, view: View): string {
  const plural = (n: number) => `${n} show${n === 1 ? "" : "s"}`;
  if (view === "all" || shown === total) return plural(total);
  return `${shown} ${view === "active" ? "upcoming" : "past"} of ${plural(total)}`;
}
const VIEWS: { key: View; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "past", label: "Past" },
  { key: "all", label: "All" },
];

/** Upcoming and still on (drafts and postponed dates included): what's looking for creators. */
const isActive = (show: { date: string; status: string }, today: string) =>
  show.date >= today && !["canceled", "completed"].includes(show.status);

type ChipShow = {
  id: string;
  date: string;
  status: string;
  venues: { city: string } | null;
  show_opportunities: OppTerms | null;
};

/** One date on a card: day · city · deposit, linking to the show. */
function DateChip({ show }: { show: ChipShow }) {
  return (
    <Link
      href={`/label/shows/${show.id}`}
      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors hover:border-primary/60"
    >
      {formatShowDate(show.date)} · {show.venues?.city}
      {show.show_opportunities ? (
        <span className="text-muted-foreground">· {formatCents(depositOf(show.show_opportunities))}</span>
      ) : null}
      {show.status !== "published" ? <span className="text-muted-foreground">({show.status})</span> : null}
    </Link>
  );
}

/** The shared card: artist photo on the left, then heading, actions and dates. */
function ShowCard({
  artist,
  eyebrow,
  title,
  subtitle,
  actions,
  children,
}: {
  artist: { name: string; image_url: string | null } | null;
  eyebrow: string;
  title: string;
  subtitle: string;
  actions: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="artist-card-img relative h-32 w-full shrink-0 overflow-hidden sm:h-auto sm:w-44">
          {artist?.image_url ? (
            <Image
              src={artist.image_url}
              alt={`${artist.name} image`}
              fill
              sizes="(max-width: 640px) 100vw, 176px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full items-end p-3">
              <span className="text-lg font-bold text-white/95">{artist?.name}</span>
            </div>
          )}
        </div>
        <div className="flex-1 p-5 sm:pl-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{eyebrow}</p>
              <h2 className="text-lg font-semibold">{title}</h2>
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

export default async function ToursPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string; imported?: string; view?: string }>;
}) {
  const context = await requireLabelPage();
  const { welcome, imported, view: rawView } = await searchParams;
  const view: View = rawView === "past" || rawView === "all" ? rawView : "active";
  const today = new Date().toISOString().slice(0, 10);
  const db = serviceDb();
  // One-off events (no tour) live under the tours, so everything is in one place.
  const { data: events } = await db
    .from("shows")
    .select(
      `id, date, status, title, artists(id, name, genre, image_url), venues(city),
       show_opportunities(stated_ticket_value_cents, deposit_percentage, published_at)`,
    )
    .eq("company_id", context.companyId)
    .is("tour_id", null)
    .order("date", { ascending: true });
  const { data: tours } = await db
    .from("tours")
    .select(
      `id, name, description, starts_on, ends_on, artist_id,
       artists(id, name, genre, image_url, bio, instagram_handle, spotify_url),
       shows(id, date, status, venues(city), show_opportunities(stated_ticket_value_cents, deposit_percentage))`,
    )
    .eq("company_id", context.companyId)
    .order("created_at", { ascending: false });

  // Existing artists (those already attached to a tour) for the "existing"
  // picker. Artists with no tour don't surface — this is the Tours-first model.
  const artistOptions = Array.from(
    new Map((tours ?? []).map((t) => [t.artist_id, t.artists?.name ?? ""])).entries(),
  ).map(([id, name]) => ({ id, name }));

  // Tours and one-off shows as one list of cards, filtered by view. A tour
  // shows only the dates in view; a new tour with no dates counts as active.
  const inView = (show: { date: string; status: string }) =>
    view === "all" ? true : view === "active" ? isActive(show, today) : !isActive(show, today);
  const byDate = (a: { date: string }, b: { date: string }) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  type Tour = NonNullable<typeof tours>[number];
  type Event = NonNullable<typeof events>[number];
  type Card =
    | { kind: "tour"; tour: Tour; shows: Tour["shows"]; allShows: Tour["shows"]; sortDate: string }
    | { kind: "event"; show: Event; sortDate: string };
  const tourCards = (tours ?? []).map((tour) => {
    const allShows = [...(tour.shows ?? [])].sort(byDate);
    return { tour, allShows, shows: allShows.filter(inView) };
  });
  const cards: Card[] = [
    ...tourCards
      .filter((t) => t.shows.length > 0 || (t.allShows.length === 0 && view !== "past"))
      .map((t) => ({
        kind: "tour" as const,
        ...t,
        // Upcoming lists sort by the next date; past by the latest.
        sortDate: (view === "past" ? t.shows[t.shows.length - 1]?.date : t.shows[0]?.date) ?? "9999-12-31",
      })),
    ...(events ?? []).filter(inView).map((show) => ({ kind: "event" as const, show, sortDate: show.date })),
  ].sort((a, b) => (view === "past" ? (a.sortDate < b.sortDate ? 1 : -1) : a.sortDate < b.sortDate ? -1 : 1));

  // Cards each view would show, for the counts on the filter.
  const countFor = (v: View) => {
    const test = (show: { date: string; status: string }) =>
      v === "all" ? true : v === "active" ? isActive(show, today) : !isActive(show, today);
    return (
      tourCards.filter((t) => t.allShows.some(test) || (t.allShows.length === 0 && v !== "past")).length +
      (events ?? []).filter(test).length
    );
  };
  const counts: Record<View, number> = { active: countFor("active"), past: countFor("past"), all: countFor("all") };

  return (
    <div className="space-y-6">
      {welcome ? (
        <div
          className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300"
          role="status"
        >
          Company created! Add your first artist while creating their tour, then add show dates.
        </div>
      ) : null}
      {imported ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300" role="status">
          Published {imported} show{imported === "1" ? "" : "s"} from the tour import.
        </div>
      ) : null}
      <PageHeader
        title="Shows"
        description="Every tour and one-off show. Click a date to see its requests, bookings and creators."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline">
              <Link href="/label/shows/import">
                <CalendarArrowDown className="size-4" aria-hidden /> Import dates
              </Link>
            </Button>
            <CreateDialog artists={artistOptions} />
          </div>
        }
      />
      {!tours?.length && !events?.length ? (
        <EmptyState
          icon={Route}
          title="No shows yet"
          description="Create a tour (add the artist in the same step, then its dates) or a one-off event."
          action={<CreateDialog artists={artistOptions} />}
        />
      ) : (
        <>
          <nav aria-label="Filter shows" className="flex flex-wrap gap-2">
            {VIEWS.map((v) => (
              <Link
                key={v.key}
                href={v.key === "active" ? "/label/tours" : `/label/tours?view=${v.key}`}
                aria-current={v.key === view ? "page" : undefined}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm transition-colors",
                  v.key === view
                    ? "border-primary bg-primary/15 font-medium"
                    : "text-muted-foreground hover:border-primary/50 hover:text-foreground",
                )}
              >
                {v.label}
                <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">{counts[v.key]}</span>
              </Link>
            ))}
          </nav>

          {cards.length ? (
            <div className="space-y-4">
              {cards.map((card) =>
                card.kind === "tour" ? (
                  <ShowCard
                    key={card.tour.id}
                    artist={card.tour.artists}
                    eyebrow={`${card.tour.artists?.name ?? ""}${card.tour.artists?.genre ? ` · ${card.tour.artists.genre}` : ""}`}
                    title={card.tour.name}
                    subtitle={`${card.tour.starts_on ? formatShowDate(card.tour.starts_on) : "Dates TBA"}${
                      card.tour.ends_on ? ` – ${formatShowDate(card.tour.ends_on)}` : ""
                    } · ${showCount(card.shows.length, card.allShows.length, view)}`}
                    actions={
                      <>
                        {card.tour.artists ? (
                          <TourEditDialog
                            tour={{
                              id: card.tour.id,
                              name: card.tour.name,
                              description: card.tour.description ?? "",
                              startsOn: card.tour.starts_on ?? "",
                              endsOn: card.tour.ends_on ?? "",
                            }}
                            deposit={tourDepositSummary(card.allShows)}
                            artist={{
                              id: card.tour.artists.id,
                              name: card.tour.artists.name,
                              genre: card.tour.artists.genre ?? "",
                              bio: card.tour.artists.bio ?? "",
                              instagramHandle: card.tour.artists.instagram_handle ?? "",
                              spotifyUrl: card.tour.artists.spotify_url ?? "",
                            }}
                          />
                        ) : null}
                        <Button asChild size="sm">
                          <Link href={`/label/shows/new?tour=${card.tour.id}`}>
                            <CalendarPlus className="size-4" aria-hidden /> Add a date
                          </Link>
                        </Button>
                        <ShareButton path={`/invite/tour/${card.tour.id}`} />
                        <DeleteTourButton tourId={card.tour.id} tourName={card.tour.name} showCount={card.allShows.length} />
                      </>
                    }
                  >
                    {card.shows.length ? (
                      <ul className="mt-3 flex flex-wrap gap-2">
                        {card.shows.map((show) => (
                          <li key={show.id}>
                            <DateChip show={show} />
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-3 text-sm text-muted-foreground">
                        No dates on this tour yet. Use “Add a date”.
                      </p>
                    )}
                  </ShowCard>
                ) : (
                  <ShowCard
                    key={card.show.id}
                    artist={card.show.artists}
                    eyebrow={`${card.show.artists?.name ?? "Event"}${card.show.artists?.genre ? ` · ${card.show.artists.genre}` : ""}`}
                    title={card.show.title || `Live in ${card.show.venues?.city ?? "town"}`}
                    subtitle={`${formatShowDate(card.show.date)} · One-off show`}
                    actions={
                      <>
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/label/shows/${card.show.id}/edit`}>
                            <Pencil className="size-4" aria-hidden /> Edit
                          </Link>
                        </Button>
                        {card.show.show_opportunities?.published_at ? (
                          <ShareButton path={`/invite/show/${card.show.id}`} />
                        ) : null}
                        <DeleteShowButton
                          showId={card.show.id}
                          showLabel={`${card.show.artists?.name ?? "this show"} on ${formatShowDate(card.show.date)}`}
                          withText
                        />
                      </>
                    }
                  >
                    <ul className="mt-3 flex flex-wrap gap-2">
                      <li>
                        <DateChip show={card.show} />
                      </li>
                    </ul>
                  </ShowCard>
                ),
              )}
            </div>
          ) : (
            <EmptyState
              icon={Route}
              title={view === "past" ? "No past shows yet" : "No upcoming shows"}
              description={
                view === "past"
                  ? "Shows move here once their date has passed or they're canceled."
                  : "Every date has passed. Add a date to a tour or create a new show."
              }
              action={view === "active" ? <CreateDialog artists={artistOptions} /> : undefined}
            />
          )}
        </>
      )}
    </div>
  );
}
