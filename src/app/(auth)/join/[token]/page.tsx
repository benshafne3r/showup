import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/guards";
import { resolveInvite } from "@/server/services/invites";
import { agencyForCreator } from "@/server/services/agencies";
import { signOut } from "../../actions";
import { acceptRosterInviteAction } from "./actions";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: "Your invite" };
export const dynamic = "force-dynamic";

function Card({ children }: { children: React.ReactNode }) {
  return <div className="space-y-4 rounded-2xl border bg-card/70 p-8 backdrop-blur">{children}</div>;
}

/**
 * Landing page for every invite link. Partner + teammate invites always make
 * a new account (straight to the invite-aware sign-up); roster invites can be
 * accepted by an existing creator too.
 */
export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;
  const invite = await resolveInvite(token);
  const user = await getSessionUser();

  if (!invite) {
    return (
      <Card>
        <h1 className="text-xl font-bold">This invite link doesn&apos;t work</h1>
        <p className="text-sm text-muted-foreground">
          It may have expired or already been used. Ask whoever sent it for a new link.
        </p>
        <Button asChild variant="outline">
          <Link href={user ? "/sign-in" : "/"}>Back to {BRAND.name}</Link>
        </Button>
      </Card>
    );
  }

  const signUpHref = `/sign-up?invite=${encodeURIComponent(token)}`;

  if (invite.kind !== "roster") {
    if (!user) redirect(signUpHref);
    return (
      <Card>
        <h1 className="text-xl font-bold">Sign out to use this invite</h1>
        <p className="text-sm text-muted-foreground">
          This link creates a new{" "}
          {invite.kind === "team" ? `${invite.companyName} team` : invite.role === "label" ? "label" : "management"}{" "}
          account. You&apos;re signed in as <span className="font-medium text-foreground">{user.email}</span> —
          sign out, then open the link again.
        </p>
        <form action={signOut}>
          <SubmitButton variant="outline" pendingLabel="Signing out…">
            Sign out
          </SubmitButton>
        </form>
      </Card>
    );
  }

  const intro = (
    <>
      <h1 className="text-xl font-bold">{invite.agencyName} invited you to {BRAND.name}</h1>
      <p className="text-sm text-muted-foreground">
        {BRAND.name} gets creators free tickets to shows in exchange for showing up (and sometimes
        posting). With {invite.agencyName} representing you, they handle conversations with artist
        teams and receive your content payouts. You still browse shows and keep your own card on
        file for ticket holds.
      </p>
    </>
  );

  if (!user) {
    return (
      <Card>
        {intro}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild size="lg" className="flex-1">
            <Link href={signUpHref}>Create my account</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="flex-1">
            <Link href={`/sign-in?next=${encodeURIComponent(`/join/${token}`)}`}>
              I already have an account
            </Link>
          </Button>
        </div>
      </Card>
    );
  }

  if (user.role !== "creator") {
    return (
      <Card>
        {intro}
        <p role="alert" className="text-sm font-medium text-red-400">
          This invite is for a creator account, and you&apos;re signed in as a {user.role}.
        </p>
      </Card>
    );
  }

  const current = await agencyForCreator(user.id);
  if (current?.id === invite.agencyId) redirect("/creator/settings");

  return (
    <Card>
      {intro}
      {invite.email && invite.email.toLowerCase() !== user.email.toLowerCase() ? (
        <p className="text-xs text-muted-foreground">
          This invite was sent to {invite.email}; you&apos;re signed in as {user.email}.
        </p>
      ) : null}
      {current ? (
        <p role="alert" className="text-sm font-medium text-red-400">
          You&apos;re already represented by {current.name}. Leave them from your Profile first.
        </p>
      ) : (
        <form action={acceptRosterInviteAction} className="space-y-3">
          <input type="hidden" name="token" value={token} />
          {error ? (
            <p role="alert" className="text-sm font-medium text-red-400">
              {error}
            </p>
          ) : null}
          <SubmitButton size="lg" className="w-full" pendingLabel="Joining…">
            Join {invite.agencyName}
          </SubmitButton>
        </form>
      )}
    </Card>
  );
}
