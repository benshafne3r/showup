import { describe, expect, it } from "vitest";
import { formatInviteMessage, type ShowBriefInput } from "@/lib/show-brief";

const show: ShowBriefInput = {
  artist: "Ninajirachi",
  date: "2026-11-11",
  doorsTime: "19:00:00",
  startTime: "20:00:00",
  venueName: "The Fonda Theatre",
  address: "6126 Hollywood Blvd.",
  city: "Los Angeles",
  state: "CA",
  ticketDelivery: "guest_list",
  contentDeadlineDays: 7,
  deliverables: [{ platform: "tiktok_video", quantity: 1, description: "tag @ninajirachi" }],
  notes: "Ask for Sam at the door",
};

describe("formatInviteMessage", () => {
  it("invites the creator by first name with where, when, the ticket and what to post", () => {
    expect(formatInviteMessage(show, { name: "Chloe Park", tickets: 1 })).toBe(
      [
        "Hey Chloe!",
        "",
        "Wanted to invite you to see Ninajirachi at The Fonda Theatre on Wed, Nov 11 (doors 7:00 PM, show 8:00 PM).",
        "",
        "Address: 6126 Hollywood Blvd., Los Angeles, CA",
        "Your ticket will be on the guest list.",
        "To post: 1 TikTok (tag @ninajirachi) by Wed, Nov 18.",
        "Notes: Ask for Sam at the door",
        "",
        "Let me know if you're in!",
      ].join("\n"),
    );
  });

  it("mentions a +1, says when there's nothing to post, and skips missing details", () => {
    const message = formatInviteMessage(
      { ...show, doorsTime: null, address: null, deliverables: [], notes: "" },
      { name: "Awzzy", tickets: 2 },
    );
    expect(message).toBe(
      [
        "Hey Awzzy!",
        "",
        "Wanted to invite you to see Ninajirachi at The Fonda Theatre on Wed, Nov 11 (show 8:00 PM).",
        "",
        "Address: Los Angeles, CA",
        "You + 1 guest will be on the guest list.",
        "No post needed for this one.",
        "",
        "Let me know if you're in!",
      ].join("\n"),
    );
  });

  it("uses plain characters only, so it's sent as a normal text", () => {
    expect(formatInviteMessage(show, { name: "Chloe", tickets: 1 })).toMatch(/^[\x20-\x7E\n]*$/);
  });
});
