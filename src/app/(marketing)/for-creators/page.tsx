import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";

export const metadata: Metadata = { title: "For creators" };

export default function ForCreatorsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-bold tracking-tight">For creators</h1>
      <p className="mt-2 text-muted-foreground">
        Complimentary concert access in exchange for showing up — and optional paid content.
      </p>

      <Card className="mt-8 border-primary/30 bg-primary/5">
        <CardContent className="space-y-3 pt-6 text-sm">
          <p className="font-semibold">The deal, in plain words:</p>
          {[
            "Attend the show and you will not be charged — the temporary hold on your card is released in full.",
            "Complete the content deliverables and you earn the stated creator payment.",
            "Attend AND post: hold released + payment received.",
            "The hold covers every ticket you request, including your +1.",
            "The hold is never money you earn — your earnings are the creator payment only.",
          ].map((line) => (
            <p key={line} className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" aria-hidden />
              {line}
            </p>
          ))}
        </CardContent>
      </Card>

      <div className="mt-10 space-y-6 text-sm text-muted-foreground">
        <div>
          <h2 className="text-base font-semibold text-foreground">What you'll see before you commit</h2>
          <p className="mt-1">
            Every show lists the artist, venue, date, ticket availability, the stated ticket
            value, the deposit percentage, the exact hold for one or two tickets, the
            deliverables, and the creator payment. You see the full breakdown again before you
            accept a booking — nothing is hidden.
          </p>
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground">When is the hold placed?</h2>
          <p className="mt-1">
            Not at booking time. Your card is saved and verified when you accept, and the
            temporary hold is placed a few days before the show. If it fails, you get time to
            fix your payment method before the booking is canceled.
          </p>
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground">What if plans change?</h2>
          <p className="mt-1">
            Message the artist team from the booking — they can cancel it, which releases
            everything. If a show is canceled or postponed, holds are released or rescheduled
            automatically and you're notified.
          </p>
        </div>
      </div>

      <Button asChild size="lg" className="mt-10">
        <Link href="/sign-up">Create your creator account</Link>
      </Button>
    </div>
  );
}
