import type { Metadata } from "next";
import Link from "next/link";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Create account" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const params = await searchParams;
  const defaultRole = params.role === "label" ? "label" : "creator";
  return (
    <div className="space-y-6 rounded-2xl border bg-card/70 p-8 backdrop-blur">
      <div className="space-y-1">
        <h1 className="text-xl font-bold">Create your account</h1>
        <p className="text-sm text-muted-foreground">
          Free tickets for creators. Reliable reach for artist teams.
        </p>
      </div>
      <SignUpForm defaultRole={defaultRole} />
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
