"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { userDb } from "@/server/db/server-client";
import { serviceDb } from "@/server/db/service";
import { enforceRateLimit, RateLimitError } from "@/server/services/rate-limit";
import { destinationFor } from "@/server/auth/destination";
import { publicEnv } from "@/lib/env";

export type AuthFormState = { error: string } | null;
export type SignUpState = { error: string } | { pending: string } | null;
export type ResetRequestState = { error: string } | { sent: true } | null;

/**
 * The seeded demo accounts (`*@demo.showup.test`, shared password) are handy in
 * dev + e2e but must not be reachable in production. Blocked in production
 * unless DEMO_ACCOUNTS_ENABLED=true is explicitly set (e.g. a demo deployment).
 */
const DEMO_EMAIL_SUFFIX = "@demo.showup.test";
function demoAccountBlocked(email: string): boolean {
  return (
    email.toLowerCase().endsWith(DEMO_EMAIL_SUFFIX) &&
    process.env.NODE_ENV === "production" &&
    process.env.DEMO_ACCOUNTS_ENABLED !== "true"
  );
}

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

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = signInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { email, password } = parsed.data;
  // Same generic error as bad credentials — don't reveal the account exists.
  if (demoAccountBlocked(email)) return { error: "Incorrect email or password" };

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

  redirect(nextFromForm(formData) ?? (await destinationFor(data.user.id)));
}

/** A safe same-origin relative path from the form (e.g. an invite target), or null. */
function nextFromForm(formData: FormData): string | null {
  const n = formData.get("next");
  return typeof n === "string" && n.startsWith("/") && !n.startsWith("//") ? n : null;
}

export async function signUp(_prev: SignUpState, formData: FormData): Promise<SignUpState> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { fullName, email, password, role } = parsed.data;
  if (demoAccountBlocked(email)) return { error: "Please use a different email address." };

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
    options: {
      data: { full_name: fullName, role },
      // Confirmation link routes through the callback, which exchanges the code
      // for a session and forwards to the role-appropriate destination.
      emailRedirectTo: `${publicEnv.appUrl}/auth/callback`,
    },
  });
  if (error) {
    return {
      error: error.message.includes("already registered")
        ? "An account with this email already exists — sign in instead."
        : error.message,
    };
  }
  // No session means email confirmation is required (mailer_autoconfirm off).
  if (!data.user || !data.session) {
    return { pending: email };
  }

  // The auth trigger mirrors into public.users; give it a beat on first signup.
  for (let i = 0; i < 10; i++) {
    const { data: row } = await serviceDb().from("users").select("id").eq("id", data.user.id).maybeSingle();
    if (row) break;
    await new Promise((r) => setTimeout(r, 150));
  }

  redirect(nextFromForm(formData) ?? (await destinationFor(data.user.id)));
}

export async function signOut(): Promise<void> {
  const db = await userDb();
  await db.auth.signOut();
  redirect("/");
}

// ── Password reset ──────────────────────────────────────────────────────

const resetRequestSchema = z.object({
  email: z.string().email("Enter a valid email address"),
});

/**
 * Step 1: email a reset link. Always reports success (never reveals whether an
 * address has an account) unless the input is invalid or rate-limited. The link
 * lands on /auth/callback, which exchanges the code for a session and forwards
 * to /update-password.
 */
export async function requestPasswordReset(
  _prev: ResetRequestState,
  formData: FormData,
): Promise<ResetRequestState> {
  const parsed = resetRequestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const email = parsed.data.email.toLowerCase();

  try {
    await enforceRateLimit("auth.reset", email);
  } catch (err) {
    if (err instanceof RateLimitError) return { error: err.message };
    throw err;
  }

  const db = await userDb();
  const redirectTo = `${publicEnv.appUrl}/auth/callback?next=${encodeURIComponent("/update-password")}`;
  await db.auth.resetPasswordForEmail(email, { redirectTo });
  return { sent: true };
}

const updatePasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
});

/**
 * Step 2: set a new password. Requires the recovery session established by the
 * callback route; without it the link has expired.
 */
export async function updatePassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = updatePasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const db = await userDb();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return { error: "Your reset link has expired. Request a new one." };

  const { error } = await db.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: error.message };

  redirect(await destinationFor(user.id));
}
