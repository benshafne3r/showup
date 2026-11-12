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
    expect(formatInviteMessage([show], { name: "Chloe Park", tickets: 1 })).toBe(
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
    const message = formatInviteMessage([{ ...show, doorsTime: null, address: null, deliverables: [], notes: "" }], {
      name: "Awzzy",
      tickets: 2,
    });
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
    expect(formatInviteMessage([show], { name: "Chloe", tickets: 1 })).toMatch(/^[\x20-\x7E\n]*$/);
  });

  it("puts several nights of one run in one text, to pick from", () => {
    const nights = ["2026-11-14", "2026-11-12", "2026-11-13"].map((date) => ({ ...show, date }));
    expect(formatInviteMessage(nights, { name: "Chloe", tickets: 1 })).toBe(
      [
        "Hey Chloe!",
        "",
        "Wanted to invite you to see Ninajirachi at The Fonda Theatre. Pick whichever night works:",
        "- Thu, Nov 12 (doors 7:00 PM, show 8:00 PM)",
        "- Fri, Nov 13 (doors 7:00 PM, show 8:00 PM)",
        "- Sat, Nov 14 (doors 7:00 PM, show 8:00 PM)",
        "",
        "Address: 6126 Hollywood Blvd., Los Angeles, CA",
        "Your ticket will be on the guest list.",
        "To post: 1 TikTok (tag @ninajirachi) within 7 days after the show.",
        "Notes: Ask for Sam at the door",
        "",
        "Let me know which date works!",
      ].join("\n"),
    );
  });

  it("gives different shows their own sections", () => {
    const other: ShowBriefInput = { ...show, artist: "Baby Keem", venueName: "The Greek Theatre", address: null, date: "2026-11-20", deliverables: [], notes: "" };
    const message = formatInviteMessage([other, show], { name: "Chloe", tickets: 1 });
    expect(message).toContain("Wanted to invite you to a few shows. Pick whichever works:");
    expect(message.indexOf("Ninajirachi at The Fonda Theatre, Wed, Nov 11")).toBeLessThan(message.indexOf("Baby Keem at The Greek Theatre, Fri, Nov 20"));
    expect(message).toContain("No post needed for this one.");
    expect(message.endsWith("Let me know which ones you're in for!")).toBe(true);
  });
});
