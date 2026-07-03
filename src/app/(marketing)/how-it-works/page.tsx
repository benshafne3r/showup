import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "How it works" };

const STEPS = [
  ["Labels post shows", "Artist teams list tour dates and set aside a limited number of complimentary tickets for creators, with a stated ticket value, content deliverables, and a creator payment."],
  ["Creators request access", "Creators browse shows in their city and request one ticket — or a ticket plus a +1 — with a pitch or content idea."],
  ["The team reviews", "Labels review creator profiles and audience metrics, then approve, waitlist, message, or pass."],
  ["24 hours to accept", "Approved creators review the final terms — ticket value, deposit percentage, the exact temporary hold, and the creator payment — then add a payment method and accept."],
  ["A temporary hold, placed close to the show", "The hold equals the stated ticket value × tickets × the deposit percentage. It covers every requested ticket, including a +1. It is placed a few days before the show — never charged upfront."],
  ["Attend — the hold is released", "Check in at the venue with photo proof. Once the team verifies attendance, the hold is released in full. Attending means you are never charged."],
  ["Post — get paid", "Submit your post link and proof. When the team approves your deliverables, the agreed creator payment is released to you."],
] as const;

export default function HowItWorksPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-bold tracking-tight">How it works</h1>
      <p className="mt-2 text-muted-foreground">
        Clear terms at every step. The hold is not a charge and never counts as earnings —
        attendance releases it, content earns the payment.
      </p>
      <ol className="mt-10 space-y-8">
        {STEPS.map(([title, body], index) => (
          <li key={title} className="flex gap-4">
            <span
              aria-hidden
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary"
            >
              {index + 1}
            </span>
            <div>
              <h2 className="font-semibold">{title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{body}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-12 flex gap-3">
        <Button asChild>
          <Link href="/sign-up">Get started</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/for-creators">Creator details</Link>
        </Button>
      </div>
    </div>
  );
}
