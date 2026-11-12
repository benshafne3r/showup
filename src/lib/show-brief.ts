import { addDays, format, parseISO } from "date-fns";
import { formatShowDate, formatShowTime } from "./dates";

export type ShowBriefInput = {
  artist: string;
  date: string;
  doorsTime: string | null;
  startTime: string | null;
  venueName: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  ticketDelivery: string | null;
  plusOneAllowed: boolean;
  /** Days after the show the post is due (only used when there's something to post). */
  contentDeadlineDays: number;
  deliverables: { platform: string; quantity: number; description: string }[];
  notes: string | null;
};

const DELIVERY: Record<string, string> = {
  guest_list: "Guest list",
  will_call: "Will call",
  digital_transfer: "Digital transfer",
  box_office: "Box office pickup",
};

const PLATFORM: Record<string, string> = {
  tiktok_video: "TikTok video",
  instagram_reel: "Instagram Reel",
  instagram_story: "Instagram Story",
  instagram_post: "Instagram post",
  youtube_short: "YouTube Short",
  youtube_video: "YouTube video",
  twitter_post: "X post",
  other: "Post",
};

/**
 * A plain-text rundown of a show for a manager to paste to their creator:
 * where and when, how the ticket works, and what to post by when. Leaves out
 * money (the hold and the creator payment are between the label and agency).
 */
export function formatShowBrief(s: ShowBriefInput): string {
  const when = [
    formatShowDate(s.date),
    s.doorsTime ? `Doors ${formatShowTime(s.doorsTime)}` : null,
    s.startTime ? `Show ${formatShowTime(s.startTime)}` : null,
  ].filter(Boolean);
  const place = [s.address, [s.city, s.state].filter(Boolean).join(", ")].filter(Boolean).join(", ");
  const ticket = [s.ticketDelivery ? DELIVERY[s.ticketDelivery] ?? null : null, s.plusOneAllowed ? "+1 allowed" : null]
    .filter(Boolean)
    .join(", ");

  const lines = [
    s.venueName ? `${s.artist} at ${s.venueName}` : s.artist,
    when.join(" · "),
    place || null,
    ticket ? `Ticket: ${ticket}` : null,
  ];
  if (s.deliverables.length) {
    for (const d of s.deliverables) {
      const what = `${d.quantity} × ${PLATFORM[d.platform] ?? "Post"}`;
      lines.push(`To post: ${what}${d.description.trim() ? ` (${d.description.trim()})` : ""}`);
    }
    const due = addDays(parseISO(s.date), s.contentDeadlineDays);
    lines.push(`Post by: ${format(due, "EEE, MMM d")}`);
  } else {
    lines.push("No post required");
  }
  if (s.notes?.trim()) lines.push(`Notes: ${s.notes.trim()}`);
  return lines.filter(Boolean).join("\n");
}
