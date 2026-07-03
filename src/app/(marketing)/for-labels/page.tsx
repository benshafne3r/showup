import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "For labels & managers" };

export default function ForLabelsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-bold tracking-tight">For labels &amp; managers</h1>
      <p className="mt-2 text-muted-foreground">
        Turn empty seats into reach you can verify.
      </p>

      <div className="mt-10 space-y-6 text-sm text-muted-foreground">
        <div>
          <h2 className="text-base font-semibold text-foreground">Accountable comps</h2>
          <p className="mt-1">
            You choose a deposit percentage (25–100%) of the stated ticket value. Creators
            agree to a temporary card hold across every ticket they take — including a +1 —
            so no-shows have real consequences and reliable creators are never charged.
          </p>
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground">Pick the right creators</h2>
          <p className="mt-1">
            Review profiles, cities, audience sizes, average views, categories, and example
            work. Approve, waitlist, message, or pass — approvals expire after 24 hours if the
            creator doesn't commit, so spots recycle automatically.
          </p>
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground">Pay only for delivered content</h2>
          <p className="mt-1">
            Set a fixed creator payment per opportunity — $0 for attend-only, or any amount
            for Stories, TikToks, Reels, or multi-deliverable packages. Review submissions and
            release payment with one click.
          </p>
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground">Run the whole tour</h2>
          <p className="mt-1">
            Manage multiple artists, tours, and shows; invite teammates; track attendance
            rates, completion rates, no-shows, and spend per campaign.
          </p>
        </div>
      </div>

      <Button asChild size="lg" className="mt-10">
        <Link href="/sign-up?role=label">Create your company account</Link>
      </Button>
    </div>
  );
}
