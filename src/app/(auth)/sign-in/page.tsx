import type { Metadata } from "next";
import Link from "next/link";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <div className="space-y-6 rounded-2xl border bg-card/70 p-8 backdrop-blur">
      <div className="space-y-1">
        <h1 className="text-xl font-bold">Welcome back</h1>
        <p className="text-sm text-muted-foreground">Sign in to your account.</p>
      </div>
      <SignInForm />
      <p className="text-center text-sm text-muted-foreground">
        New here?{" "}
        <Link href="/sign-up" className="font-medium text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
