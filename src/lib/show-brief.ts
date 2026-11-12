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

const timesOf = (s: ShowBriefInput) =>
  [s.doorsTime ? `doors ${formatShowTime(s.doorsTime)}` : null, s.startTime ? `show ${formatShowTime(s.startTime)}` : null]
    .filter(Boolean)
    .join(", ");
const whenOf = (s: ShowBriefInput) => `${formatShowDate(s.date)}${timesOf(s) ? ` (${timesOf(s)})` : ""}`;
const addressOf = (s: ShowBriefInput) =>
  [s.address, [s.city, s.state].filter(Boolean).join(", ")].filter(Boolean).join(", ");
const postsOf = (s: ShowBriefInput) =>
  s.deliverables
    .map((d) => {
      const [one, many] = PLATFORM[d.platform] ?? PLATFORM.other;
      const what = `${d.quantity} ${d.quantity === 1 ? one : many}`;
      return d.description.trim() ? `${what} (${d.description.trim()})` : what;
    })
    .join(" and ");

/** Address, ticket, what to post and notes for one show. `due` words the post deadline. */
function detailLines(s: ShowBriefInput, tickets: number, due: string): string[] {
  const ticketFor = tickets > 1 ? "You + 1 guest" : "Your ticket";
  const delivery = s.ticketDelivery ? DELIVERY[s.ticketDelivery] : null;
  const lines = [
    addressOf(s) ? `Address: ${addressOf(s)}` : null,
    delivery ? `${ticketFor} will be ${delivery}.` : tickets > 1 ? "You can bring a +1." : null,
    s.deliverables.length ? `To post: ${postsOf(s)} ${due}.` : "No post needed for this one.",
    s.notes?.trim() ? `Notes: ${s.notes.trim()}` : null,
  ];
  return lines.filter((l): l is string => !!l);
}

const dueBy = (s: ShowBriefInput) => `by ${format(addDays(parseISO(s.date), s.contentDeadlineDays), "EEE, MMM d")}`;
const dueAfter = (days: number) =>
  days === 0 ? "the day of the show" : `within ${days} day${days === 1 ? "" : "s"} after the show`;

/**
 * A text a manager can send their creator to invite them, written as if from
 * the manager: where and when, the ticket, and what to post by when. Several
 * invites (say three nights of one run) go in one text: the dates to pick
 * from, then the shared details; different shows each get their own section.
 * Plain characters only, so it stays a normal SMS. Leaves out money (the hold
 * and the creator payment are between the label and the agency).
 */
export function formatInviteMessage(
  shows: ShowBriefInput[],
  creator: { name: string; tickets: number },
): string {
  const firstName = creator.name.trim().split(/\s+/)[0] ?? "";
  const hey = firstName ? `Hey ${firstName}!` : "Hey!";
  const sorted = [...shows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const [first] = sorted;
  const where = (s: ShowBriefInput) => `${s.artist}${s.venueName ? ` at ${s.venueName}` : ""}`;

  if (sorted.length === 1) {
    return [
      hey,
      "",
      `Wanted to invite you to see ${where(first)} on ${whenOf(first)}.`,
      "",
      ...detailLines(first, creator.tickets, dueBy(first)),
      "",
      "Let me know if you're in!",
    ].join("\n");
  }

  const oneRun = sorted.every((s) => where(s) === where(first) && addressOf(s) === addressOf(first));
  if (oneRun) {
    const sameDue = sorted.every((s) => s.contentDeadlineDays === first.contentDeadlineDays);
    return [
      hey,
      "",
      `Wanted to invite you to see ${where(first)}. Pick whichever night works:`,
      ...sorted.map((s) => `- ${whenOf(s)}`),
      "",
      ...detailLines(first, creator.tickets, sameDue ? dueAfter(first.contentDeadlineDays) : "after the show"),
      "",
      "Let me know which date works!",
    ].join("\n");
  }

  return [
    hey,
    "",
    "Wanted to invite you to a few shows. Pick whichever works:",
    ...sorted.flatMap((s) => ["", `${where(s)}, ${whenOf(s)}`, ...detailLines(s, creator.tickets, dueBy(s))]),
    "",
    "Let me know which ones you're in for!",
  ].join("\n");
}
