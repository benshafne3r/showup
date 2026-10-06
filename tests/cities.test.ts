import { describe, expect, it } from "vitest";
import { cityKey } from "@/lib/cities";

describe("cityKey", () => {
  it("normalizes case, spacing and a trailing state", () => {
    expect(cityKey("Los Angeles")).toBe("los angeles");
    expect(cityKey("  los   angeles, CA ")).toBe("los angeles");
  });

  it("maps common nicknames", () => {
    expect(cityKey("LA")).toBe("los angeles");
    expect(cityKey("NYC")).toBe("new york");
    expect(cityKey("New York City")).toBe("new york");
  });

  it("leaves other cities alone", () => {
    expect(cityKey("Nashville, TN")).toBe("nashville");
  });
});
