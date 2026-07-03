"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { userDb } from "@/server/db/server-client";
import { serviceDb } from "@/server/db/service";
import { enforceRateLimit, RateLimitError } from "@/server/services/rate-limit";
import { claimInvites } from "@/server/services/companies";

export type AuthFormState = { error: string } | null;

const signInSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

const signUpSchema = z.object({
  fullName: z.string().min(2, "Enter your name").max(80),
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
  role: z.enum(["creator", "label"]),
});

async function destinationFor(userId: string): Promise<string> {
  const db = serviceDb();
  const { data: user } = await db.from("users").select("role, email").eq("id", userId).maybeSingle();
  if (!user) return "/";
  if (user.role === "admin") return "/admin";
  if (user.role === "label") {
    await claimInvites(userId, user.email);
    const { data: membership } = await db
      .from("company_members")
      .select("id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    return membership ? "/label" : "/label/onboarding";
  }
  const { data: profile } = await db
    .from("creator_profiles")
    .select("onboarded_at")
    .eq("user_id", userId)
    .maybeSingle();
  return profile?.onboarded_at ? "/creator" : "/creator/onboarding";
}

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = signInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { email, password } = parsed.data;

  try {
    await enforceRateLimit("auth.sign_in", email.toLowerCase());
  } catch (err) {
    if (err instanceof RateLimitError) return { error: err.message };
    throw err;
  }

  const db = await userDb();
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { error: "Incorrect email or password" };

  const { data: row } = await serviceDb()
    .from("users")
    .select("status")
    .eq("id", data.user.id)
    .maybeSingle();
  if (row?.status === "suspended") {
    await db.auth.signOut();
    return { error: "This account has been suspended. Contact support." };
  }

  redirect(await destinationFor(data.user.id));
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { fullName, email, password, role } = parsed.data;

  try {
    await enforceRateLimit("auth.sign_up", email.toLowerCase());
  } catch (err) {
    if (err instanceof RateLimitError) return { error: err.message };
    throw err;
  }

  const db = await userDb();
  const { data, error } = await db.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, role } },
  });
  if (error) {
    return {
      error: error.message.includes("already registered")
        ? "An account with this email already exists — sign in instead."
        : error.message,
    };
  }
  if (!data.user || !data.session) {
    return { error: "Check your email to confirm your account, then sign in." };
  }

  // The auth trigger mirrors into public.users; give it a beat on first signup.
  for (let i = 0; i < 10; i++) {
    const { data: row } = await serviceDb().from("users").select("id").eq("id", data.user.id).maybeSingle();
    if (row) break;
    await new Promise((r) => setTimeout(r, 150));
  }

  redirect(await destinationFor(data.user.id));
}

export async function signOut(): Promise<void> {
  const db = await userDb();
  await db.auth.signOut();
  redirect("/");
}
