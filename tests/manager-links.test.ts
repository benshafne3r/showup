import { describe, expect, it } from "vitest";
import { managerLinkFor } from "@/lib/manager-links";

describe("managerLinkFor", () => {
  it("maps creator pages to their management-portal equivalents", () => {
    expect(managerLinkFor("/creator/bookings/b1")).toBe("/manager/bookings/b1");
    expect(managerLinkFor("/creator/messages/t1")).toBe("/manager/messages/t1");
    expect(managerLinkFor("/creator/shows/s1")).toBe("/manager/shows/s1");
    expect(managerLinkFor("/creator/payments")).toBe("/manager/payments");
  });

  it("collapses request lists (with any query) to the requests tab", () => {
    expect(managerLinkFor("/creator/messages?tab=requests&submitted=1")).toBe("/manager/messages?tab=requests");
    expect(managerLinkFor("/creator/requests")).toBe("/manager/messages?tab=requests");
  });

  it("falls back to the roster for anything else", () => {
    expect(managerLinkFor(undefined)).toBe("/manager");
    expect(managerLinkFor("/creator/settings")).toBe("/manager");
    expect(managerLinkFor("/creator")).toBe("/manager");
  });
});
