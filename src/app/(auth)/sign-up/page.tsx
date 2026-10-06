import type { Metadata } from "next";
import Link from "next/link";
import { SignUpForm } from "./sign-up-form";
import { resolveInvite, type ResolvedInvite } from "@/server/services/invites";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: "Create account" };

function inviteCopy(invite: ResolvedInvite): { title: string; subtitle: string } {
  switch (invite.kind) {
    case "partner":
      return invite.role === "label"
        ? {
            title: "Create your label account",
            subtitle: "You've been invited to book creators for your artists' shows.",
          }
        : {
            title: "Create your management account",
            subtitle: "You've been invited to manage your creators' shows, messages and payouts.",
          };
    case "team":
      return {
        title: `Join ${invite.companyName}`,
        subtitle: `You've been invited to ${invite.companyName}'s team on ${BRAND.name}.`,
      };
    case "roster":
      return {
        title: `Join ${invite.agencyName} on ${BRAND.name}`,
        subtitle: `${invite.agencyName} will handle your conversations with artist teams. You'll browse shows and add your card for ticket holds.`,
      };
  }
}

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string; next?: string }>;
}) {
  const params = await searchParams;
  const next = params.next;
  const signInHref = next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in";
  const invite = params.invite ? await resolveInvite(params.invite) : null;

  if (params.invite && !invite) {
    return (
      <div className="space-y-4 rounded-2xl border bg-card/70 p-8 backdrop-blur">
        <h1 className="text-xl font-bold">This invite link doesn&apos;t work</h1>
        <p className="text-sm text-muted-foreground">
          It may have expired or already been used. Ask whoever sent it for a new link.
        </p>
        <p className="text-sm">
          <Link href="/sign-up" className="font-medium text-primary hover:underline">
            Sign up as a creator instead
          </Link>
        </p>
      </div>
    );
  }

  const copy = invite
    ? inviteCopy(invite)
    : { title: "Create your creator account", subtitle: "Free tickets to shows in your city." };
  const lockEmail = invite ? invite.kind !== "roster" && !!invite.email : false;

  return (
    <div className="space-y-6 rounded-2xl border bg-card/70 p-8 backdrop-blur">
      <div className="space-y-1">
        <h1 className="text-xl font-bold">{copy.title}</h1>
        <p className="text-sm text-muted-foreground">{copy.subtitle}</p>
      </div>
      <SignUpForm
        next={next}
        invite={
          invite && params.invite
            ? {
                token: params.invite,
                email: invite.email ?? "",
                emailLocked: lockEmail,
                fullName: invite.kind === "roster" ? invite.fullName : "",
              }
            : undefined
        }
      />
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href={signInHref} className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
      {!invite ? (
        <p className="border-t pt-4 text-center text-xs text-muted-foreground">
          Label or management company? Partner accounts are by invitation.{" "}
          <a
            href={`mailto:${BRAND.supportEmail}?subject=${encodeURIComponent(`${BRAND.name} partner access`)}`}
            className="font-medium text-primary hover:underline"
          >
            Request access
          </a>
          .
        </p>
      ) : null}
    </div>
  );
}
