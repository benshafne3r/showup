/**
 * When to nudge a creator who signed up but hasn't finished setup
 * (profile + card). Pure so it can be unit-tested; the job lives in
 * services/setup-reminders.ts.
 */

const DAY_MS = 86_400_000;

/** Days after sign-up for each reminder. Two at most. */
export const SETUP_REMINDER_DAYS = [1, 4] as const;
/** Minimum days between two reminders (an old account never gets both at once). */
export const SETUP_REMINDER_GAP_DAYS = 3;
/** Accounts older than this are left alone (no surprise emails to idle sign-ups). */
export const SETUP_REMINDER_WINDOW_DAYS = 21;

export type SetupStep = "profile" | "card";

/** What the creator still has to do, or null when setup is complete. */
export function missingSetupStep(input: { onboarded: boolean; hasCard: boolean }): SetupStep | null {
  if (!input.onboarded) return "profile";
  if (!input.hasCard) return "card";
  return null;
}

export function setupReminderDue(input: {
  signedUpAt: Date;
  remindersSent: number;
  lastSentAt: Date | null;
  now: Date;
}): boolean {
  const { signedUpAt, remindersSent, lastSentAt, now } = input;
  if (remindersSent >= SETUP_REMINDER_DAYS.length) return false;
  const age = now.getTime() - signedUpAt.getTime();
  if (age > SETUP_REMINDER_WINDOW_DAYS * DAY_MS) return false;
  if (age < SETUP_REMINDER_DAYS[remindersSent] * DAY_MS) return false;
  if (lastSentAt && now.getTime() - lastSentAt.getTime() < SETUP_REMINDER_GAP_DAYS * DAY_MS) return false;
  return true;
}
