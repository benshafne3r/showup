import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { userDb } from "@/server/db/server-client";
import { UpdatePasswordForm } from "./update-password-form";

export const metadata: Metadata = { title: "Set a new password" };

export default async function UpdatePasswordPage() {
  // Reachable only with the recovery session the callback route established.
  const db = await userDb();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/forgot-password?error=expired");

  return (
    <div className="space-y-6 rounded-2xl border bg-card/70 p-8 backdrop-blur">
      <div className="space-y-1">
        <h1 className="text-xl font-bold">Set a new password</h1>
        <p className="text-sm text-muted-foreground">Choose a new password for your account.</p>
      </div>
      <UpdatePasswordForm />
    </div>
  );
}
