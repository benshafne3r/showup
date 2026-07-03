import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BadgeCheck, HandCoins, ShieldCheck, Sparkles, Ticket, TrendingUp } from "lucide-react";

export default function LandingPage() {
  return (
    <>
      <section className="gradient-stage">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-4 py-24 text-center md:py-32">
          <p className="rounded-full border border-primary/30 bg-primary/10 px-4 py-1 text-xs font-medium text-primary">
            The marketplace for concert access
          </p>
          <h1 className="max-w-3xl text-4xl font-extrabold tracking-tight text-balance md:text-6xl">
            Free tickets for creators who <span className="text-gradient-brand">show up</span>.
          </h1>
          <p className="max-w-2xl text-lg text-muted-foreground text-balance">
            {BRAND.name} connects music labels and artist teams with creators who get
            complimentary concert access — attend the show and your card hold is released,
            post about it and you get paid.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/sign-up">I'm a creator</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/sign-up?role=label">I'm a label or manager</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-20">
        <h2 className="text-center text-2xl font-bold tracking-tight md:text-3xl">
          Simple promise, clear terms
        </h2>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            {
              icon: Ticket,
              title: "Request a free ticket",
              body: "Browse shows in your city, request one ticket or bring a +1, and pitch your content idea to the artist team.",
            },
            {
              icon: ShieldCheck,
              title: "Attend — you're never charged",
              body: "A temporary card hold encourages reliable attendance. Check in at the show and the hold is released in full.",
            },
            {
              icon: HandCoins,
              title: "Post and get paid",
              body: "Complete the agreed deliverables and earn the creator payment on top of your free ticket.",
            },
          ].map((item) => (
            <Card key={item.title}>
              <CardContent className="space-y-3 pt-6">
                <item.icon className="size-6 text-primary" aria-hidden />
                <h3 className="font-semibold">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-t bg-card/40">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-20 md:grid-cols-2">
          <div className="space-y-4">
            <Sparkles className="size-6 text-primary" aria-hidden />
            <h2 className="text-2xl font-bold tracking-tight">For creators</h2>
            <p className="text-muted-foreground">
              Real shows, real access, zero upfront cost. Your card is only held — never
              charged — as long as you show up. Every opportunity states the ticket value,
              the hold, and your payment before you commit.
            </p>
            <Button asChild variant="outline">
              <Link href="/for-creators">Learn more</Link>
            </Button>
          </div>
          <div className="space-y-4">
            <TrendingUp className="size-6 text-primary" aria-hidden />
            <h2 className="text-2xl font-bold tracking-tight">For labels &amp; managers</h2>
            <p className="text-muted-foreground">
              Fill rooms with creators who actually attend and post. Review audience metrics,
              approve the right people, verify attendance, and pay only for delivered content.
            </p>
            <Button asChild variant="outline">
              <Link href="/for-labels">Learn more</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-6xl flex-col items-center gap-4 px-4 py-20 text-center">
        <BadgeCheck className="size-8 text-primary" aria-hidden />
        <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
          Attendance releases the hold. Content earns the payment.
        </h2>
        <p className="max-w-xl text-muted-foreground">
          That's the whole deal — spelled out on every show, every request, and every
          booking. No surprises.
        </p>
        <Button asChild size="lg">
          <Link href="/sign-up">Join {BRAND.name}</Link>
        </Button>
      </section>
    </>
  );
}
