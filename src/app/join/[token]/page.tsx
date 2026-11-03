import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/guards";
import { resolveInvite } from "@/server/services/invites";
import { signOut } from "@/app/(auth)/actions";
import { PartnerLanding } from "./partner-landing";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";

const PRIVATE = { index: false, follow: false } as const;

/** Link previews (iMessage, Slack…) say who the invite is for. Viewing never consumes it. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const invite = await resolveInvite((await params).token);
  if (invite?.kind === "partner") {
    const forWhom = invite.role === "label" ? "labels" : "management companies";
    const description =
      invite.role === "label"
        ? "Fill your comp tickets with creators who actually show up and post."
        : "Get your roster into shows, keep label conversations with you, and receive content payments.";
    return {
      title: `Private invite for ${forWhom}`,
      description,
      openGraph: { title: `You're invited to ${BRAND.name}`, description },
      robots: PRIVATE,
    };
  }
  return { title: "Your invite", robots: PRIVATE };
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-center px-4 py-12 md:py-20">
      <div className="w-full max-w-md space-y-4 rounded-2xl border bg-card/70 p-8 backdrop-blur">
        {children}
      </div>
    </div>
  );
}

/**
 * Landing page for every invite link. Partner invites (labels, management)
 * get a private pitch page with sign-up built in; teammate invites go to the
 * invite-aware sign-up.
 */
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
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

  if (user) {
    return (
      <Card>
        <h1 className="text-xl font-bold">Sign out to use this invite</h1>
        <p className="text-sm text-muted-foreground">
          This link creates a new{" "}
          {invite.kind === "team" ? `${invite.companyName} team` : invite.role === "label" ? "label" : "management"}{" "}
          account. You&apos;re signed in as{" "}
          <span className="font-medium text-foreground">{user.email}</span>. Sign out, then open the
          link again.
        </p>
        <form action={signOut}>
          <SubmitButton variant="outline" pendingLabel="Signing out…">
            Sign out
          </SubmitButton>
        </form>
      </Card>
    );
  }
  if (invite.kind === "team") redirect(signUpHref);
  return <PartnerLanding kind={invite.role} token={token} orgName={invite.orgName} email={invite.email} />;
}
