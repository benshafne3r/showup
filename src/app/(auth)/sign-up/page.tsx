import type { Metadata } from "next";
import Link from "next/link";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Create account" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; next?: string }>;
}) {
  const params = await searchParams;
  const defaultRole = params.role === "label" ? "label" : "creator";
  const next = params.next;
  const signInHref = next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in";
  return (
    <div className="space-y-6 rounded-2xl border bg-card/70 p-8 backdrop-blur">
      <div className="space-y-1">
        <h1 className="text-xl font-bold">Create your account</h1>
        <p className="text-sm text-muted-foreground">
          Free tickets for creators. Reliable reach for artist teams.
        </p>
      </div>
      <SignUpForm defaultRole={defaultRole} next={next} />
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href={signInHref} className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
