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
  /** Days after the show the post is due (only used when there's something to post). */
  contentDeadlineDays: number;
  deliverables: { platform: string; quantity: number; description: string }[];
  notes: string | null;
};

const DELIVERY: Record<string, string> = {
  guest_list: "on the guest list",
  will_call: "at will call",
  digital_transfer: "sent to you digitally",
  box_office: "at the box office",
};

const PLATFORM: Record<string, [string, string]> = {
  tiktok_video: ["TikTok", "TikToks"],
  instagram_reel: ["Instagram Reel", "Instagram Reels"],
  instagram_story: ["Instagram Story", "Instagram Stories"],
  instagram_post: ["Instagram post", "Instagram posts"],
  youtube_short: ["YouTube Short", "YouTube Shorts"],
  youtube_video: ["YouTube video", "YouTube videos"],
  twitter_post: ["X post", "X posts"],
  other: ["post", "posts"],
};

/**
 * A text a manager can send their creator to invite them to a show, written
 * as if from the manager: where and when, the ticket, and what to post by
 * when. Plain characters only, so it stays a short SMS. Leaves out money
 * (the hold and the creator payment are between the label and the agency).
 */
export function formatInviteMessage(
  s: ShowBriefInput,
  creator: { name: string; tickets: number },
): string {
  const firstName = creator.name.trim().split(/\s+/)[0] ?? "";
  const times = [
    s.doorsTime ? `doors ${formatShowTime(s.doorsTime)}` : null,
    s.startTime ? `show ${formatShowTime(s.startTime)}` : null,
  ].filter(Boolean);
  const where = s.venueName ? ` at ${s.venueName}` : "";
  const invite = `Wanted to invite you to see ${s.artist}${where} on ${formatShowDate(s.date)}${times.length ? ` (${times.join(", ")})` : ""}.`;

  const address = [s.address, [s.city, s.state].filter(Boolean).join(", ")].filter(Boolean).join(", ");
  const ticketFor = creator.tickets > 1 ? "You + 1 guest" : "Your ticket";
  const delivery = s.ticketDelivery ? DELIVERY[s.ticketDelivery] : null;

  const details = [
    address ? `Address: ${address}` : null,
    delivery ? `${ticketFor} will be ${delivery}.` : creator.tickets > 1 ? "You can bring a +1." : null,
  ];
  if (s.deliverables.length) {
    const posts = s.deliverables
      .map((d) => {
        const [one, many] = PLATFORM[d.platform] ?? PLATFORM.other;
        const what = `${d.quantity} ${d.quantity === 1 ? one : many}`;
        return d.description.trim() ? `${what} (${d.description.trim()})` : what;
      })
      .join(" and ");
    const due = format(addDays(parseISO(s.date), s.contentDeadlineDays), "EEE, MMM d");
    details.push(`To post: ${posts} by ${due}.`);
  } else {
    details.push("No post needed for this one.");
  }
  if (s.notes?.trim()) details.push(`Notes: ${s.notes.trim()}`);

  return [firstName ? `Hey ${firstName}!` : "Hey!", "", invite, "", ...details.filter(Boolean), "", "Let me know if you're in!"].join("\n");
}
