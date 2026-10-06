import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  CalendarRange,
  Eye,
  LayoutDashboard,
  MessagesSquare,
  ShieldCheck,
  Ticket,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";
import { SignUpForm } from "@/app/(auth)/sign-up/sign-up-form";
import { BRAND } from "@/lib/brand";

type Pitch = {
  audience: string;
  headline: string;
  intro: string;
  benefits: Array<{ icon: LucideIcon; title: string; body: string }>;
  steps: string[];
};

const PITCHES: Record<"label" | "manager", Pitch> = {
  manager: {
    audience: "management companies",
    headline: "Get your roster into shows and keep every conversation with you.",
    intro: `${BRAND.name} connects artist teams with creators: free concert tickets in exchange for showing up and posting. A management account lets you run it for your whole roster.`,
    benefits: [
      {
        icon: Ticket,
        title: "Book your whole roster",
        body: "Browse open shows in every city and request tickets for any of your creators in a couple of clicks.",
      },
      {
        icon: MessagesSquare,
        title: "Labels talk to you, not your talent",
        body: "Every message from an artist team about your creators lands in your inbox, and you reply on their behalf.",
      },
      {
        icon: Banknote,
        title: "Content payments come to you",
        body: "When a label approves a creator's post, the payment goes to your company's payout account. Handle the split your way.",
      },
      {
        icon: LayoutDashboard,
        title: "One view of everything",
        body: "Requests, bookings, check-ins, posts and view counts across your roster, and you're copied on every update.",
      },
      {
        icon: UserCheck,
        title: "Simple for your creators",
        body: "They get their own login to browse shows near them and add a card for the temporary ticket hold, released when they attend.",
      },
    ],
    steps: [
      "Create your account and name your company.",
      "Add creators by email. They accept and join your roster.",
      "Request tickets for them (or they request themselves); artist teams approve.",
      "They attend and post. You track it all and receive the content payments.",
    ],
  },
  label: {
    audience: "labels",
    headline: "Fill your comp tickets with creators who actually show up and post.",
    intro: `${BRAND.name} is where artist teams list tour dates, set aside complimentary tickets, and get verified attendance and content from vetted creators.`,
    benefits: [
      {
        icon: ShieldCheck,
        title: "Accountable comps",
        body: "Creators agree to a temporary card hold: a percentage of the ticket value you choose. No-shows have consequences; reliable creators are never charged.",
      },
      {
        icon: Users,
        title: "Pick the right creators",
        body: "See city, audience size, average views and past work on every request. Approve, waitlist or pass. Unclaimed approvals expire after 24 hours.",
      },
      {
        icon: Wallet,
        title: "Pay only for delivered content",
        body: "Set a fixed creator payment per show: $0 for attend-only, or any amount for Stories, TikToks or Reels. Release it in one click once you approve.",
      },
      {
        icon: Eye,
        title: "Verified attendance and views",
        body: "Creators check in with proof at the show, and TikTok posts are tracked for live status and view counts.",
      },
      {
        icon: CalendarRange,
        title: "Run the whole tour",
        body: "Import tour dates from Ticketmaster, add one-off events, manage multiple artists and bring your team.",
      },
    ],
    steps: [
      "Create your account and set up your company.",
      "Add a tour (import dates from Ticketmaster) or a one-off event.",
      "Set tickets, the hold, and the content ask; creators request.",
      "Approve the right creators. They attend and post; you release payment.",
    ],
  },
};

/**
 * The private landing page a partner invite link opens: a short pitch for
 * the audience, then sign-up right on the page (the invite rides along).
 */
export function PartnerLanding({
  kind,
  token,
  orgName,
  email,
}: {
  kind: "label" | "manager";
  token: string;
  orgName: string;
  email: string | null;
}) {
  const pitch = PITCHES[kind];
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16">
      <section className="max-w-3xl pt-6 pb-10 md:pt-12">
        <p className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">
          Private invite{orgName ? ` · ${orgName}` : ""}
        </p>
        <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-balance md:text-5xl">
          {pitch.headline}
        </h1>
        <p className="mt-4 text-lg text-pretty text-muted-foreground">{pitch.intro}</p>
      </section>

      <div className="grid items-start gap-10 lg:grid-cols-[1fr_400px]">
        {/* Sign-up comes first on phones, sits in a sticky side column on desktop. */}
        <aside className="lg:sticky lg:top-6 lg:order-last">
          <div className="space-y-5 rounded-2xl border bg-card/80 p-6 shadow-2xl shadow-primary/10 backdrop-blur md:p-7">
            <div className="space-y-1">
              <h2 className="text-xl font-bold">Create your account</h2>
              <p className="text-sm text-muted-foreground">
                Takes about a minute. This link is just for you and works once.
              </p>
            </div>
            <SignUpForm
              invite={{ token, email: email ?? "", emailLocked: !!email, fullName: "" }}
            />
            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/sign-in" className="font-medium text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </aside>

        <div className="space-y-12">
          <section aria-labelledby="benefits-heading">
            <h2 id="benefits-heading" className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              Why {pitch.audience} use {BRAND.name}
            </h2>
            <ul className="mt-5 grid gap-4 sm:grid-cols-2">
              {pitch.benefits.map((benefit) => (
                <li key={benefit.title} className="rounded-xl border bg-card/60 p-5">
                  <benefit.icon className="size-5 text-primary" aria-hidden />
                  <p className="mt-3 font-semibold">{benefit.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{benefit.body}</p>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="steps-heading">
            <h2 id="steps-heading" className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              How it works
            </h2>
            <ol className="mt-5 space-y-3">
              {pitch.steps.map((step, index) => (
                <li key={step} className="flex gap-4 rounded-xl border bg-card/60 p-4">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground tabular-nums">
                    {index + 1}
                  </span>
                  <span className="pt-0.5 text-sm">{step}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
