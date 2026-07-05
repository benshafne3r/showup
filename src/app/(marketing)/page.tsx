import Link from "next/link";
import Image from "next/image";
import { BRAND } from "@/lib/brand";
import { publicEnv } from "@/lib/env";
import { Button } from "@/components/ui/button";
import { formatCentsCompact } from "@/lib/money";
import { ArrowRight, BadgeCheck, Check, Plus } from "lucide-react";

const DEMO_IMAGES = `${publicEnv.supabaseUrl}/storage/v1/object/public/artist-images/demo`;

/** FanMoments-style fading name wall — real Columbia roster, loud to ghosted. */
const ARTIST_WALL: Array<{ names: string[]; className: string }> = [
  { names: ["Baby Keem", "Ella Langley"], className: "text-4xl md:text-6xl opacity-100" },
  { names: ["Harry Styles", "Rosalía"], className: "text-3xl md:text-5xl opacity-75" },
  { names: ["The Kid LAROI", "Lil Nas X", "Dominic Fike"], className: "text-2xl md:text-4xl opacity-50" },
  { names: ["AJR", "Tyler Childers", "Måneskin", "Mora"], className: "text-xl md:text-3xl opacity-30" },
];

const HOW_IT_WORKS: Array<[string, string]> = [
  [
    "1. Labels post shows",
    "Artist teams list tour dates and set aside complimentary tickets — with a stated ticket value, deliverables, and a fixed creator payment.",
  ],
  [
    "2. Creators request access",
    "Browse shows in your city, request one ticket or a +1, and pitch your content idea. Teams review your audience and approve the right fit.",
  ],
  [
    "3. Attend — the hold is released",
    "A temporary card hold (a percentage of the ticket value) keeps everyone reliable. Check in at the show and it's released in full — attend and you are never charged.",
  ],
  [
    "4. Post — get paid",
    "Submit your deliverables after the show. Once the team approves them, the agreed creator payment is released to you on top of your free ticket.",
  ],
];

export default function LandingPage() {
  return (
    <>
      {/* ── Hero: full-bleed photo, giant centered headline (indify) ───── */}
      <section className="relative flex min-h-[86vh] items-center justify-center overflow-hidden">
        <Image
          src={`${DEMO_IMAGES}/ella-langley.jpg`}
          alt=""
          aria-hidden
          fill
          priority
          sizes="100vw"
          className="object-cover object-[center_22%]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/60 to-background" />
        <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center gap-6 px-4 py-24 text-center">
          <h1 className="font-sans text-5xl font-extrabold tracking-tight text-balance text-white md:text-7xl">
            Free tickets for creators who show up.
          </h1>
          <p className="max-w-xl text-lg font-medium text-balance text-white/85">
            {BRAND.name} connects artist teams with creators — complimentary concert
            access in exchange for reliable attendance and content.
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="rounded-full px-7">
              <Link href="/sign-up">Join as a creator</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="rounded-full border-white/40 bg-white/5 px-7 text-white backdrop-blur hover:bg-white/15 hover:text-white"
            >
              <Link href="/sign-up?role=label">Join as a label</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ── Artist name wall (fanmoments) ───────────────────────────────── */}
      <section className="mx-auto w-full max-w-6xl px-4 py-24">
        <p className="text-center text-xs font-semibold tracking-[0.25em] text-muted-foreground uppercase">
          Creators cover shows from artists like
        </p>
        <div className="mt-10 space-y-3 text-center">
          {ARTIST_WALL.map((row, index) => (
            <p
              key={index}
              className={`font-sans font-extrabold tracking-tight uppercase ${row.className}`}
            >
              {row.names.map((name, i) => (
                <span key={name} className="whitespace-nowrap">
                  {i > 0 ? <span className="mx-3 align-middle font-normal opacity-60 md:mx-5">——</span> : null}
                  {name}
                </span>
              ))}
            </p>
          ))}
        </div>
      </section>

      {/* ── Big statement + product mockup (fanmoments) ─────────────────── */}
      <section className="mx-auto w-full max-w-6xl px-4 py-24">
        <h2 className="text-center font-sans text-4xl font-extrabold tracking-tight text-balance md:text-6xl">
          Every seat filled.
          <br />
          Every show posted.
        </h2>
        <div className="mx-auto mt-14 max-w-4xl overflow-hidden rounded-2xl border bg-black/50 shadow-2xl shadow-primary/10">
          <div className="flex items-center gap-1.5 border-b bg-card/80 px-4 py-3" aria-hidden>
            <span className="size-2.5 rounded-full bg-red-400/70" />
            <span className="size-2.5 rounded-full bg-amber-400/70" />
            <span className="size-2.5 rounded-full bg-emerald-400/70" />
            <span className="ml-3 rounded-md bg-muted/60 px-3 py-0.5 text-[11px] text-muted-foreground">
              showup.app/creator
            </span>
          </div>
          <div className="grid gap-4 p-5 md:grid-cols-[1fr_1fr_0.9fr] md:p-6">
            {[
              {
                img: `${DEMO_IMAGES}/baby-keem.jpg`,
                artist: "Baby Keem",
                meta: "The Echoplex · Los Angeles",
                pay: 15000,
              },
              {
                img: `${DEMO_IMAGES}/ella-langley.jpg`,
                artist: "Ella Langley",
                meta: "The Basement East · Nashville",
                pay: 17500,
              },
            ].map((card) => (
              <div key={card.artist} className="overflow-hidden rounded-xl border bg-card">
                <div className="relative aspect-[16/10]">
                  <Image
                    src={card.img}
                    alt={`${card.artist} artist image`}
                    fill
                    sizes="(max-width: 768px) 100vw, 320px"
                    className="object-cover"
                  />
                  <span className="absolute top-2 right-2 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[11px] font-bold text-emerald-950">
                    Earn {formatCentsCompact(card.pay)}
                  </span>
                </div>
                <div className="p-3">
                  <p className="text-sm font-semibold">{card.artist}</p>
                  <p className="text-xs text-muted-foreground">{card.meta}</p>
                </div>
              </div>
            ))}
            <div className="flex flex-col justify-center gap-2.5 rounded-xl border bg-card p-4 text-xs">
              {[
                ["Attendance verified", "hold released — $0 charged"],
                ["TikTok approved", "$150 paid to creator"],
                ["Guest list", "6 of 8 tickets claimed"],
              ].map(([title, detail]) => (
                <div key={title} className="flex items-start gap-2">
                  <BadgeCheck className="mt-0.5 size-4 shrink-0 text-emerald-400" aria-hidden />
                  <div>
                    <p className="font-semibold">{title}</p>
                    <p className="text-muted-foreground">{detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── For creators (indify split) ─────────────────────────────────── */}
      <section className="border-y bg-card/50">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-24 lg:grid-cols-2">
          <div>
            <p className="font-sans text-2xl font-extrabold tracking-tight">For creators</p>
            <h2 className="mt-3 font-sans text-5xl font-medium tracking-tight italic md:text-6xl">
              Free shows.
              <br />
              Paid posts.
            </h2>
            <ul className="mt-6 space-y-1.5 text-muted-foreground">
              <li>- Complimentary tickets to shows in your city — bring a +1</li>
              <li>- Attend and you're never charged: the card hold is released at check-in</li>
              <li>- Earn a fixed payment for every approved deliverable</li>
              <li>- Message artist teams directly and build real relationships</li>
            </ul>
            <Button asChild variant="link" className="mt-4 px-0 text-primary">
              <Link href="/for-creators">
                How it works for creators <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
          </div>
          <div className="rounded-2xl border bg-background p-5 shadow-xl">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <p className="font-semibold">Mia Torres</p>
                <p className="text-xs text-muted-foreground">Los Angeles · 182k audience</p>
              </div>
              <span className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
                Booking confirmed
              </span>
            </div>
            <dl className="divide-y text-sm">
              {[
                ["Ticket value", "$100 · comped", ""],
                ["Temporary hold", "released at check-in", "text-emerald-400"],
                ["You were charged", "$0.00", "text-emerald-400"],
                ["Creator payment", "+$150.00 paid", "text-emerald-400"],
              ].map(([label, value, tone]) => (
                <div key={label} className="flex items-center justify-between py-3">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className={`font-semibold ${tone}`}>{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* ── For labels (indify split, alternate) ────────────────────────── */}
      <section className="bg-muted/30">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-24 lg:grid-cols-2">
          <div>
            <p className="font-sans text-2xl font-extrabold tracking-tight text-muted-foreground">
              For labels &amp; managers
            </p>
            <h2 className="mt-3 font-sans text-5xl font-medium tracking-tight italic md:text-6xl">
              Rooms full
              <br />
              of reach.
            </h2>
            <ul className="mt-6 space-y-1.5 text-muted-foreground">
              <li>- Turn unsold seats into verified creator coverage</li>
              <li>- Review real audience metrics before you approve anyone</li>
              <li>- Card holds keep no-shows accountable — you choose the deposit</li>
              <li>- Pay only for content you've reviewed and approved</li>
            </ul>
            <Button asChild variant="link" className="mt-4 px-0 text-primary">
              <Link href="/for-labels">
                How it works for labels <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
          </div>
          <div className="rounded-2xl border bg-background p-5 shadow-xl">
            <p className="border-b pb-3 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
              Requests · Baby Keem — Los Angeles
            </p>
            <ul className="divide-y text-sm">
              {[
                ["Mia Torres", "145k TikTok · 52k avg views", "Approved"],
                ["Ava Patel", "168k TikTok · 70k avg views", "Waitlist"],
                ["Jay Park", "78k Instagram · 19k avg views", "Pending"],
              ].map(([name, metrics, status]) => (
                <li key={name} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-semibold">{name}</p>
                    <p className="text-xs text-muted-foreground">{metrics}</p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      status === "Approved"
                        ? "bg-emerald-500/15 text-emerald-300"
                        : status === "Waitlist"
                          ? "bg-amber-500/15 text-amber-300"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {status}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── How it works: numbered expandable rows (fanmoments) ─────────── */}
      <section className="mx-auto w-full max-w-3xl px-4 py-24">
        <h2 className="font-sans text-3xl font-extrabold tracking-tight">How it works</h2>
        <div className="mt-8 space-y-3">
          {HOW_IT_WORKS.map(([title, body]) => (
            <details key={title} className="group rounded-xl border bg-card px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
                {title}
                <Plus
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-45"
                  aria-hidden
                />
              </summary>
              <p className="mt-3 text-sm text-muted-foreground">{body}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── Sign up today: two cards (indify) ───────────────────────────── */}
      <section className="border-t bg-card/40">
        <div className="mx-auto w-full max-w-4xl px-4 py-24">
          <h2 className="text-center font-sans text-4xl font-extrabold tracking-tight md:text-5xl">
            Sign up today
          </h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            {[
              {
                audience: "Creators",
                price: "Free",
                features: [
                  "Free tickets to shows in your city",
                  "Never charged when you attend",
                  "Keep 100% of your creator payments",
                  "In-app messaging with artist teams",
                ],
                cta: "Apply as a creator",
                href: "/sign-up",
              },
              {
                audience: "Labels & managers",
                price: "Free in beta",
                features: [
                  "Unlimited shows and opportunities",
                  "Audience metrics on every request",
                  "Deposit holds keep creators reliable",
                  "Pay only for approved content",
                ],
                cta: "Join as a label",
                href: "/sign-up?role=label",
              },
            ].map((plan) => (
              <div
                key={plan.audience}
                className="flex flex-col rounded-2xl border-2 border-primary/60 bg-background p-7"
              >
                <p className="text-sm text-muted-foreground">{plan.audience}</p>
                <p className="mt-1 font-sans text-4xl font-extrabold tracking-tight">{plan.price}</p>
                <ul className="mt-6 flex-1 space-y-3 text-sm">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5">
                      <span
                        className="mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded-full bg-foreground text-background"
                        aria-hidden
                      >
                        <Check className="size-3" />
                      </span>
                      {feature}
                    </li>
                  ))}
                </ul>
                <Button asChild className="mt-8 rounded-full">
                  <Link href={plan.href}>{plan.cta}</Link>
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Quote (indify) ───────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-2xl px-4 py-24 text-center">
        <blockquote className="font-sans text-2xl font-semibold text-balance md:text-3xl">
          "Twelve shows this year, zero charges on my card, and my best-performing
          posts. {BRAND.name} is a cheat code."
        </blockquote>
        <p className="mt-4 text-sm text-muted-foreground">
          — Mia Torres, creator · 182k audience
        </p>
      </section>
    </>
  );
}
