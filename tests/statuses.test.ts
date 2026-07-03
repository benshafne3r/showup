import { describe, expect, it } from "vitest";
import {
  ATTENDANCE_TRANSITIONS,
  AUTHORIZATION_TRANSITIONS,
  BOOKING_TRANSITIONS,
  canTransition,
  CONTENT_TRANSITIONS,
  CREATOR_PAYMENT_TRANSITIONS,
  REQUEST_TRANSITIONS,
} from "@/lib/statuses";

describe("request state machine", () => {
  it("allows the review decisions from pending", () => {
    for (const to of ["approved", "rejected", "waitlisted", "withdrawn"] as const) {
      expect(canTransition(REQUEST_TRANSITIONS, "pending", to)).toBe(true);
    }
  });
  it("allows approval from the waitlist", () => {
    expect(canTransition(REQUEST_TRANSITIONS, "waitlisted", "approved")).toBe(true);
  });
  it("blocks double decisions", () => {
    expect(canTransition(REQUEST_TRANSITIONS, "approved", "approved")).toBe(false);
    expect(canTransition(REQUEST_TRANSITIONS, "rejected", "approved")).toBe(false);
    expect(canTransition(REQUEST_TRANSITIONS, "expired", "approved")).toBe(false);
  });
});

describe("booking state machine", () => {
  it("follows the golden path", () => {
    expect(canTransition(BOOKING_TRANSITIONS, "awaiting_acceptance", "confirmed")).toBe(true);
    expect(canTransition(BOOKING_TRANSITIONS, "confirmed", "attended")).toBe(true);
    expect(canTransition(BOOKING_TRANSITIONS, "attended", "completed")).toBe(true);
  });
  it("handles authorization failure and recovery", () => {
    expect(canTransition(BOOKING_TRANSITIONS, "confirmed", "authorization_failed")).toBe(true);
    expect(canTransition(BOOKING_TRANSITIONS, "authorization_failed", "confirmed")).toBe(true);
    expect(canTransition(BOOKING_TRANSITIONS, "authorization_failed", "canceled")).toBe(true);
  });
  it("terminal states stay terminal", () => {
    expect(BOOKING_TRANSITIONS.completed).toHaveLength(0);
    expect(BOOKING_TRANSITIONS.canceled).toHaveLength(0);
  });
  it("cannot resurrect a canceled booking", () => {
    expect(canTransition(BOOKING_TRANSITIONS, "canceled", "confirmed")).toBe(false);
  });
});

describe("attendance state machine", () => {
  it("submit → approve/reject", () => {
    expect(canTransition(ATTENDANCE_TRANSITIONS, "not_started", "submitted")).toBe(true);
    expect(canTransition(ATTENDANCE_TRANSITIONS, "submitted", "approved")).toBe(true);
    expect(canTransition(ATTENDANCE_TRANSITIONS, "submitted", "rejected")).toBe(true);
  });
  it("allows resubmission after rejection", () => {
    expect(canTransition(ATTENDANCE_TRANSITIONS, "rejected", "submitted")).toBe(true);
  });
  it("approval is final (no un-approving without a dispute)", () => {
    expect(ATTENDANCE_TRANSITIONS.approved).toHaveLength(0);
  });
});

describe("content state machine", () => {
  it("submitted content can be approved, revised, or rejected", () => {
    for (const to of ["approved", "revision_requested", "rejected"] as const) {
      expect(canTransition(CONTENT_TRANSITIONS, "submitted", to)).toBe(true);
    }
  });
  it("revision loops back through submission", () => {
    expect(canTransition(CONTENT_TRANSITIONS, "revision_requested", "submitted")).toBe(true);
    expect(canTransition(CONTENT_TRANSITIONS, "revision_requested", "approved")).toBe(false);
  });
  it("not_required never transitions", () => {
    expect(CONTENT_TRANSITIONS.not_required).toHaveLength(0);
  });
});

describe("authorization state machine (double-spend protection)", () => {
  it("follows schedule → pending → authorized → released", () => {
    expect(canTransition(AUTHORIZATION_TRANSITIONS, "not_scheduled", "scheduled")).toBe(true);
    expect(canTransition(AUTHORIZATION_TRANSITIONS, "scheduled", "pending")).toBe(true);
    expect(canTransition(AUTHORIZATION_TRANSITIONS, "pending", "authorized")).toBe(true);
    expect(canTransition(AUTHORIZATION_TRANSITIONS, "authorized", "released")).toBe(true);
    expect(canTransition(AUTHORIZATION_TRANSITIONS, "authorized", "captured")).toBe(true);
  });
  it("released holds cannot be captured (and vice versa)", () => {
    expect(canTransition(AUTHORIZATION_TRANSITIONS, "released", "captured")).toBe(false);
    expect(canTransition(AUTHORIZATION_TRANSITIONS, "captured", "released")).toBe(false);
    expect(canTransition(AUTHORIZATION_TRANSITIONS, "released", "released")).toBe(false);
    expect(canTransition(AUTHORIZATION_TRANSITIONS, "captured", "captured")).toBe(false);
  });
  it("failed authorizations can retry", () => {
    expect(canTransition(AUTHORIZATION_TRANSITIONS, "failed", "pending")).toBe(true);
    expect(canTransition(AUTHORIZATION_TRANSITIONS, "failed", "canceled")).toBe(true);
  });
});

describe("creator payment state machine (double-payout protection)", () => {
  it("ready payments can be paid once", () => {
    expect(canTransition(CREATOR_PAYMENT_TRANSITIONS, "ready", "paid")).toBe(true);
    expect(canTransition(CREATOR_PAYMENT_TRANSITIONS, "paid", "paid")).toBe(false);
    expect(CREATOR_PAYMENT_TRANSITIONS.paid).toHaveLength(0);
  });
  it("failed payouts can retry", () => {
    expect(canTransition(CREATOR_PAYMENT_TRANSITIONS, "failed", "paid")).toBe(true);
  });
  it("canceled payments stay canceled", () => {
    expect(CREATOR_PAYMENT_TRANSITIONS.canceled).toHaveLength(0);
  });
});
