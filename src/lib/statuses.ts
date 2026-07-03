import type { Database } from "@/lib/database.types";

type Enums = Database["public"]["Enums"];
export type RequestStatus = Enums["request_status"];
export type BookingStatus = Enums["booking_status"];
export type AttendanceStatus = Enums["attendance_status"];
export type ContentStatus = Enums["content_status"];
export type AuthorizationStatus = Enums["authorization_status"];
export type CreatorPaymentStatus = Enums["creator_payment_status"];
export type ShowStatus = Enums["show_status"];
export type DisputeStatus = Enums["dispute_status"];

/**
 * Legal state transitions. Services validate every transition against these
 * maps AND claim it with a status-guarded UPDATE, so an illegal or duplicate
 * transition can never be forced from a client.
 */
export const REQUEST_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  pending: ["approved", "rejected", "waitlisted", "expired", "withdrawn"],
  waitlisted: ["approved", "rejected", "expired", "withdrawn"],
  approved: ["expired"], // acceptance window lapses
  rejected: [],
  expired: [],
  withdrawn: [],
};

export const BOOKING_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  awaiting_acceptance: ["awaiting_payment_method", "confirmed", "canceled"],
  awaiting_payment_method: ["confirmed", "canceled"],
  confirmed: ["authorization_failed", "attended", "no_show_review", "completed", "canceled", "disputed"],
  authorization_failed: ["confirmed", "canceled", "disputed"],
  attended: ["completed", "disputed"],
  no_show_review: ["attended", "completed", "canceled", "disputed"],
  disputed: ["confirmed", "attended", "no_show_review", "completed", "canceled"],
  completed: [],
  canceled: [],
};

export const ATTENDANCE_TRANSITIONS: Record<AttendanceStatus, AttendanceStatus[]> = {
  not_started: ["submitted"],
  submitted: ["approved", "rejected", "disputed"],
  rejected: ["submitted", "approved", "disputed"], // resubmit or admin override
  disputed: ["approved", "rejected"],
  approved: [],
};

export const CONTENT_TRANSITIONS: Record<ContentStatus, ContentStatus[]> = {
  not_required: [],
  pending: ["submitted"],
  submitted: ["approved", "revision_requested", "rejected", "disputed"],
  revision_requested: ["submitted"],
  rejected: ["submitted", "approved", "disputed"],
  disputed: ["approved", "rejected"],
  approved: [],
};

export const AUTHORIZATION_TRANSITIONS: Record<AuthorizationStatus, AuthorizationStatus[]> = {
  not_scheduled: ["scheduled", "canceled"],
  scheduled: ["pending", "canceled"],
  pending: ["authorized", "failed", "canceled"],
  authorized: ["released", "captured", "canceled"],
  failed: ["scheduled", "pending", "canceled"], // retry after payment method update
  released: [],
  captured: [],
  canceled: [],
};

export const CREATOR_PAYMENT_TRANSITIONS: Record<CreatorPaymentStatus, CreatorPaymentStatus[]> = {
  not_required: [],
  awaiting_funding: ["funded", "canceled"],
  funded: ["pending_fulfillment", "canceled"],
  pending_fulfillment: ["ready", "disputed", "canceled"],
  ready: ["paid", "failed", "disputed", "canceled"],
  failed: ["ready", "paid", "canceled"],
  disputed: ["ready", "paid", "canceled"],
  paid: [],
  canceled: [],
};

export function canTransition<S extends string>(
  map: Record<S, S[]>,
  from: S,
  to: S,
): boolean {
  return map[from]?.includes(to) ?? false;
}

// ── Display metadata ────────────────────────────────────────────────────

type Tone = "neutral" | "info" | "success" | "warning" | "danger";

export const REQUEST_STATUS_META: Record<RequestStatus, { label: string; tone: Tone }> = {
  pending: { label: "Pending review", tone: "info" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Not selected", tone: "neutral" },
  waitlisted: { label: "Waitlisted", tone: "warning" },
  expired: { label: "Expired", tone: "neutral" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
};

export const BOOKING_STATUS_META: Record<BookingStatus, { label: string; tone: Tone }> = {
  awaiting_acceptance: { label: "Awaiting your acceptance", tone: "warning" },
  awaiting_payment_method: { label: "Payment method needed", tone: "warning" },
  confirmed: { label: "Confirmed", tone: "success" },
  authorization_failed: { label: "Card hold failed", tone: "danger" },
  attended: { label: "Attended", tone: "success" },
  no_show_review: { label: "No-show review", tone: "danger" },
  completed: { label: "Completed", tone: "success" },
  canceled: { label: "Canceled", tone: "neutral" },
  disputed: { label: "Disputed", tone: "danger" },
};

export const ATTENDANCE_STATUS_META: Record<AttendanceStatus, { label: string; tone: Tone }> = {
  not_started: { label: "Not checked in", tone: "neutral" },
  submitted: { label: "Proof submitted", tone: "info" },
  approved: { label: "Attendance verified", tone: "success" },
  rejected: { label: "Attendance rejected", tone: "danger" },
  disputed: { label: "Attendance disputed", tone: "danger" },
};

export const CONTENT_STATUS_META: Record<ContentStatus, { label: string; tone: Tone }> = {
  not_required: { label: "No content required", tone: "neutral" },
  pending: { label: "Content pending", tone: "info" },
  submitted: { label: "Content submitted", tone: "info" },
  revision_requested: { label: "Revision requested", tone: "warning" },
  approved: { label: "Content approved", tone: "success" },
  rejected: { label: "Content rejected", tone: "danger" },
  disputed: { label: "Content disputed", tone: "danger" },
};

export const AUTHORIZATION_STATUS_META: Record<AuthorizationStatus, { label: string; tone: Tone }> = {
  not_scheduled: { label: "Hold not scheduled", tone: "neutral" },
  scheduled: { label: "Hold scheduled", tone: "info" },
  pending: { label: "Placing hold…", tone: "info" },
  authorized: { label: "Hold active", tone: "warning" },
  failed: { label: "Hold failed", tone: "danger" },
  released: { label: "Hold released", tone: "success" },
  captured: { label: "Hold charged", tone: "danger" },
  canceled: { label: "Hold canceled", tone: "neutral" },
};

export const CREATOR_PAYMENT_STATUS_META: Record<CreatorPaymentStatus, { label: string; tone: Tone }> = {
  not_required: { label: "No payment attached", tone: "neutral" },
  awaiting_funding: { label: "Awaiting funding", tone: "info" },
  funded: { label: "Funded", tone: "info" },
  pending_fulfillment: { label: "Pending deliverables", tone: "info" },
  ready: { label: "Ready to pay", tone: "warning" },
  paid: { label: "Paid", tone: "success" },
  failed: { label: "Payment failed", tone: "danger" },
  disputed: { label: "Payment disputed", tone: "danger" },
  canceled: { label: "Payment canceled", tone: "neutral" },
};
