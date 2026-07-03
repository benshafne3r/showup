import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { formatCentsCompact } from "@/lib/money";
import { formatShowDate } from "@/lib/dates";
import { CalendarDays, MapPin, Ticket, Users } from "lucide-react";

export type ShowCardData = {
  showId: string;
  artistName: string;
  artistGenre: string;
  imageUrl: string | null;
  venueName: string;
  city: string;
  date: string;
  creatorPaymentCents: number;
  deliverableSummary: string;
  ticketsRemaining: number;
  plusOneAllowed: boolean;
};

/**
 * Discovery card. Per spec, the deposit is intentionally NOT shown here —
 * the card leads with artist, city, venue, date, creator payment,
 * deliverables, and availability. Hold details live on the show page.
 */
export function ShowCard({ show, href }: { show: ShowCardData; href: string }) {
  const soldOut = show.ticketsRemaining <= 0;
  return (
    <Link
      href={href}
      className="group flex flex-col overflow-hidden rounded-xl border bg-card transition-colors hover:border-primary/50 focus-visible:outline-2 focus-visible:outline-ring"
    >
      <div className="artist-card-img relative aspect-[16/9] w-full overflow-hidden">
        {show.imageUrl ? (
          <Image
            src={show.imageUrl}
            alt={`${show.artistName} artist image`}
            fill
            sizes="(max-width: 768px) 100vw, 33vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full items-end p-4">
            <span className="text-3xl font-bold tracking-tight text-white/95 drop-shadow-sm">
              {show.artistName}
            </span>
          </div>
        )}
        <div className="absolute top-3 right-3 flex gap-1.5">
          {show.creatorPaymentCents > 0 ? (
            <Badge className="border-transparent bg-emerald-500/90 text-emerald-950 font-semibold">
              Earn {formatCentsCompact(show.creatorPaymentCents)}
            </Badge>
          ) : (
            <Badge variant="secondary">Attend only</Badge>
          )}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div>
          <h3 className="font-semibold leading-tight">{show.artistName}</h3>
          <p className="text-xs text-muted-foreground">{show.artistGenre}</p>
        </div>
        <div className="space-y-1 text-sm text-muted-foreground">
          <p className="flex items-center gap-1.5">
            <CalendarDays className="size-3.5 shrink-0" aria-hidden />
            {formatShowDate(show.date)}
          </p>
          <p className="flex items-center gap-1.5">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            {show.venueName} · {show.city}
          </p>
          {show.deliverableSummary ? (
            <p className="line-clamp-1 text-xs">{show.deliverableSummary}</p>
          ) : null}
        </div>
        <div className="mt-auto flex items-center justify-between pt-2 text-xs">
          <span
            className={
              soldOut ? "font-medium text-red-300" : "flex items-center gap-1 text-muted-foreground"
            }
          >
            <Ticket className="size-3.5" aria-hidden />
            {soldOut
              ? "Fully claimed"
              : `${show.ticketsRemaining} ticket${show.ticketsRemaining === 1 ? "" : "s"} left`}
          </span>
          {show.plusOneAllowed ? (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Users className="size-3.5" aria-hidden />
              +1 ok
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
