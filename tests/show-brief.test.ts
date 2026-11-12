import { describe, expect, it } from "vitest";
import { formatShowBrief, type ShowBriefInput } from "@/lib/show-brief";

const base: ShowBriefInput = {
  artist: "Ninajirachi",
  date: "2026-11-11",
  doorsTime: "19:00:00",
  startTime: "20:00:00",
  venueName: "The Fonda Theatre",
  address: "6126 Hollywood Blvd.",
  city: "Los Angeles",
  state: "CA",
  ticketDelivery: "guest_list",
  plusOneAllowed: true,
  contentDeadlineDays: 7,
  deliverables: [{ platform: "tiktok_video", quantity: 1, description: "tag @ninajirachi" }],
  notes: "Ask for Sam at the door",
};

describe("formatShowBrief", () => {
  it("lists where, when, the ticket, what to post and by when", () => {
    expect(formatShowBrief(base)).toBe(
      [
        "Ninajirachi at The Fonda Theatre",
        "Wed, Nov 11 · Doors 7:00 PM · Show 8:00 PM",
        "6126 Hollywood Blvd., Los Angeles, CA",
        "Ticket: Guest list, +1 allowed",
        "To post: 1 × TikTok video (tag @ninajirachi)",
        "Post by: Wed, Nov 18",
        "Notes: Ask for Sam at the door",
      ].join("\n"),
    );
  });

  it("says when there's nothing to post and skips missing details", () => {
    const brief = formatShowBrief({
      ...base,
      doorsTime: null,
      address: null,
      plusOneAllowed: false,
      deliverables: [],
      notes: "",
    });
    expect(brief).toBe(
      ["Ninajirachi at The Fonda Theatre", "Wed, Nov 11 · Show 8:00 PM", "Los Angeles, CA", "Ticket: Guest list", "No post required"].join("\n"),
    );
  });
});
