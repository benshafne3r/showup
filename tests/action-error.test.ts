import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { toActionError } from "@/server/action-error";
import { AuthError } from "@/server/auth/guards";
import { RateLimitError } from "@/server/services/rate-limit";

/**
 * toActionError is the boundary that decides what error text reaches the
 * browser. Expected domain errors pass through; anything unexpected must be
 * logged server-side and shown as a generic message — never the raw internals.
 */
describe("toActionError", () => {
  it("passes AuthError messages through", () => {
    expect(toActionError(new AuthError("Admin access required"))).toEqual({
      error: "Admin access required",
    });
  });

  it("passes RateLimitError messages through", () => {
    const result = toActionError(new RateLimitError());
    expect(result.error).toMatch(/too many/i);
  });

  it("surfaces the first Zod validation issue", () => {
    const parsed = z.string().min(5, "Too short").safeParse("hi");
    expect(parsed.success).toBe(false);
    expect(toActionError(parsed.success ? null : parsed.error)).toEqual({
      error: "Too short",
    });
  });

  it("hides unexpected error details and logs them", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const leaky = new Error('relation "internal_secrets" does not exist');

    const result = toActionError(leaky, "test.context");

    // The raw internal message must NOT reach the user.
    expect(result.error).toBe("Something went wrong. Please try again.");
    expect(result.error).not.toContain("internal_secrets");
    // But it must be logged server-side for observability.
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain("internal_secrets");
    spy.mockRestore();
  });

  it("handles non-Error throws without leaking", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(toActionError("raw string boom")).toEqual({
      error: "Something went wrong. Please try again.",
    });
    spy.mockRestore();
  });
});
