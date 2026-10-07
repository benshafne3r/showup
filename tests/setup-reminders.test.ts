import { describe, expect, it } from "vitest";
import { missingSetupStep, setupReminderDue } from "@/lib/setup-reminders";

const DAY = 86_400_000;
const now = new Date("2026-10-10T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * DAY);

describe("missingSetupStep", () => {
  it("asks for the profile first, then the card", () => {
    expect(missingSetupStep({ onboarded: false, hasCard: false })).toBe("profile");
    expect(missingSetupStep({ onboarded: true, hasCard: false })).toBe("card");
    expect(missingSetupStep({ onboarded: true, hasCard: true })).toBeNull();
  });
});

describe("setupReminderDue", () => {
  it("waits a day after sign-up for the first reminder", () => {
    expect(setupReminderDue({ signedUpAt: daysAgo(0.5), remindersSent: 0, lastSentAt: null, now })).toBe(false);
    expect(setupReminderDue({ signedUpAt: daysAgo(1.1), remindersSent: 0, lastSentAt: null, now })).toBe(true);
  });

  it("sends the second on day 4, and never a third", () => {
    expect(setupReminderDue({ signedUpAt: daysAgo(3), remindersSent: 1, lastSentAt: daysAgo(2), now })).toBe(false);
    expect(setupReminderDue({ signedUpAt: daysAgo(4.1), remindersSent: 1, lastSentAt: daysAgo(3.1), now })).toBe(true);
    expect(setupReminderDue({ signedUpAt: daysAgo(10), remindersSent: 2, lastSentAt: daysAgo(6), now })).toBe(false);
  });

  it("spaces reminders out even for older accounts", () => {
    expect(setupReminderDue({ signedUpAt: daysAgo(10), remindersSent: 1, lastSentAt: daysAgo(1), now })).toBe(false);
  });

  it("leaves long-idle sign-ups alone", () => {
    expect(setupReminderDue({ signedUpAt: daysAgo(30), remindersSent: 0, lastSentAt: null, now })).toBe(false);
  });
});
