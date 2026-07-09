import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { serviceDb } from "@/server/db/service";
import { BRAND } from "@/lib/brand";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { formatShowDate } from "@/lib/dates";
import { Ticket, CalendarCheck, Camera, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

type Params = { kind: string; id: string };

type Artist = { name: string; genre: string | null; image_url: string | null; bio: string | null };

async function loadInvite(kind: string, id: string) {
  const db = serviceDb();

  if (kind === "tour") {
    const { data } = await db
      .from("tours")
      .select(
        `id, name, artists(name, genre, image_url, bio),
         shows(id, date, status, venues(city), show_opportunities(published_at))`,
      )
      .eq("id", id)
      .maybeSingle();
    if (!data?.artists) return null;
    const shows = (data.shows ?? [])
      .filter((s) => s.show_opportunities?.published_at && s.status === "published")
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    if (!shows.length) return null; // nothing publicly published to invite to
    return {
      artist: data.artists as Artist,
      heading: data.name,
      dates: shows.map((s) => ({ date: s.date, city: s.venues?.city ?? "" })),
      applyHref: `/sign-up?role=creator&next=${encodeURIComponent(`/creator/shows/${shows[0].id}`)}`,
    };
  }

  if (kind === "show") {
    const { data } = await db
      .from("shows")
      .select(
        `id, date, status, artists(name, genre, image_url, bio),
         venues(name, city), show_opportunities(published_at)`,
      )
      .eq("id", id)
      .maybeSingle();
    if (!data?.artists || !data.show_opportunities?.published_at || data.status !== "published") {
      return null;
    }
    return {
      artist: data.artists as Artist,
      heading: `${data.artists.name} · ${data.venues?.city ?? ""}`,
      dates: [{ date: data.date, city: data.venues?.city ?? "" }],
      applyHref: `/sign-up?role=creator&next=${encodeURIComponent(`/creator/shows/${data.id}`)}`,
    };
  }

  return null;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { kind, id } = await params;
  const invite = await loadInvite(kind, id);
  if (!invite) return { title: "Invite" };
  const title = `${invite.artist.name} — free tickets on ${BRAND.name}`;
  return { title, description: `You're invited: ${invite.heading}. ${BRAND.tagline}` };
}

export default async function InvitePage({ params }: { params: Promise<Params> }) {
  const { kind, id } = await params;
  const invite = await loadInvite(kind, id);
  if (!invite) notFound();

  const { artist, heading, dates, applyHref } = invite;

  return (
    <div className="gradient-stage flex min-h-screen flex-col">
      <header className="p-6">
        <Link href="/" aria-label={`${BRAND.name} home`}>
          <Logo />
        </Link>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-6 pb-16">
        {/* Hero */}
        <div className="overflow-hidden rounded-2xl border bg-card">
          <div className="artist-card-img relative h-56 w-full overflow-hidden">
            {artist.image_url ? (
              <Image
                src={artist.image_url}
                alt={artist.name}
                fill
                sizes="(max-width: 768px) 100vw, 672px"
                className="object-cover"
                priority
              />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-5">
              <p className="text-xs font-semibold tracking-wide text-white/85 uppercase">
                You&rsquo;re invited
              </p>
              <h1 className="text-2xl font-bold text-white drop-shadow">{heading}</h1>
              {artist.genre ? (
                <p className="text-sm text-white/80 capitalize">{artist.genre}</p>
              ) : null}
            </div>
          </div>

          <div className="space-y-5 p-6">
            {/* Dates */}
            <div className="flex flex-wrap gap-2">
              {dates.map((d, i) => (
                <span
                  key={`${d.date}-${i}`}
                  className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm"
                >
                  <CalendarCheck className="size-3.5 text-primary" aria-hidden />
                  {formatShowDate(d.date)}
                  {d.city ? ` · ${d.city}` : ""}
                </span>
              ))}
            </div>

            <Button asChild size="lg" className="w-full">
              <Link href={applyHref}>
                Apply for free tickets <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Already have a {BRAND.name} account?{" "}
              <Link href="/sign-in" className="text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </div>

        {/* The concept */}
        <div className="mt-8 space-y-4">
          <h2 className="text-lg font-semibold">How {BRAND.name} works</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { icon: Ticket, title: "Free tickets", body: "Labels comp your spot at the show — no cost to you." },
              { icon: CalendarCheck, title: "Just show up", body: "Attend and check in. That releases the hold on your card." },
              { icon: Camera, title: "Optional posts", body: "Share a reel or story if it's part of the offer, and get paid." },
            ].map((step) => (
              <div key={step.title} className="rounded-xl border bg-card/60 p-4">
                <step.icon className="size-5 text-primary" aria-hidden />
                <p className="mt-2 font-medium">{step.title}</p>
                <p className="text-sm text-muted-foreground">{step.body}</p>
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">{BRAND.description}</p>
        </div>
      </main>
    </div>
  );
}
