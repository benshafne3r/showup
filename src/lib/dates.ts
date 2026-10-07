import { format, formatDistanceToNowStrict, isPast, parseISO } from "date-fns";

/** "2026-08-14" → "Fri, Aug 14" */
export function formatShowDate(date: string): string {
  return format(parseISO(date), "EEE, MMM d");
}

/** "2026-08-14" → "Friday, August 14, 2026" */
export function formatShowDateLong(date: string): string {
  return format(parseISO(date), "EEEE, MMMM d, yyyy");
}

/** "19:30:00" → "7:30 PM" */
export function formatShowTime(time: string | null): string | null {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  const d = new Date(2000, 0, 1, h, m);
  return format(d, "h:mm a");
}

/** timestamptz → "Aug 14, 2026, 7:30 PM" (viewer-local) */
export function formatDateTime(iso: string): string {
  return format(new Date(iso), "MMM d, yyyy, h:mm a");
}

/** timestamptz → "3 hours" / "2 days" until/since */
export function timeUntil(iso: string): string {
  return formatDistanceToNowStrict(new Date(iso));
}

export function isDeadlinePast(iso: string): boolean {
  return isPast(new Date(iso));
}

/**
 * Whether a show date is over: 08:00 UTC the next day, which is after
 * midnight everywhere in the US, so late shows have finished. No-show
 * decisions open (and labels are reminded) only after this.
 */
export function showIsOver(showDate: string, now = new Date()): boolean {
  return now.getTime() >= Date.parse(`${showDate}T00:00:00Z`) + 32 * 3_600_000;
}

/**
 * Show-day check for attendance check-in. Uses the UTC date, like every other
 * "today" in the app (Discover, deadlines), so dev machines in other time
 * zones behave like production (which runs in UTC). Evening US shows are
 * already the next UTC day, so this never closes check-in early.
 */
export function isShowDay(showDate: string): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return showDate <= today;
}
