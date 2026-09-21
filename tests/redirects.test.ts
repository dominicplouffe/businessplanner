import { describe, expect, it } from "vitest";
import { safeInternalPath } from "@/lib/redirects";

/* ==========================================================================
   The open redirect on sign-in.
   --------------------------------------------------------------------------
   `next` was read from the query string and handed straight to `router.push`.
   `/sign-in?next=https://evil.example/` therefore took somebody who had just
   typed their password and sent them to another site, arriving from the host
   they had trusted a second earlier.
   ========================================================================== */

describe("a path a redirect may use", () => {
  it("lets an ordinary internal path through, query and fragment intact", () => {
    expect(safeInternalPath("/dashboard")).toBe("/dashboard");
    expect(safeInternalPath("/plans/abc?tab=1#sizing")).toBe("/plans/abc?tab=1#sizing");
  });

  it("refuses an absolute URL", () => {
    expect(safeInternalPath("https://evil.example/")).toBe("/dashboard");
    expect(safeInternalPath("http://evil.example/plans")).toBe("/dashboard");
  });

  it("refuses a protocol-relative URL, which is an absolute one in disguise", () => {
    expect(safeInternalPath("//evil.example")).toBe("/dashboard");
    expect(safeInternalPath("//evil.example/plans/abc")).toBe("/dashboard");
  });

  it("refuses a backslash, which browsers normalise to a slash", () => {
    // `/\evil.example` is `//evil.example` by the time it is resolved.
    expect(safeInternalPath("/\\evil.example")).toBe("/dashboard");
    expect(safeInternalPath("\\\\evil.example")).toBe("/dashboard");
  });

  it("refuses the encoded forms of both", () => {
    expect(safeInternalPath("/%2fevil.example")).toBe("/dashboard");
    expect(safeInternalPath("/%2Fevil.example")).toBe("/dashboard");
    expect(safeInternalPath("/%5cevil.example")).toBe("/dashboard");
  });

  it("refuses a scheme that is not a location at all", () => {
    expect(safeInternalPath("javascript:alert(1)")).toBe("/dashboard");
    expect(safeInternalPath("data:text/html,<script>")).toBe("/dashboard");
  });

  it("refuses control characters, which can truncate a header", () => {
    expect(safeInternalPath("/dashboard\nLocation: https://evil.example")).toBe("/dashboard");
    expect(safeInternalPath("/dash\u0000board")).toBe("/dashboard");
  });

  it("refuses anything that is not a usable string", () => {
    expect(safeInternalPath(null)).toBe("/dashboard");
    expect(safeInternalPath(undefined)).toBe("/dashboard");
    expect(safeInternalPath("")).toBe("/dashboard");
    expect(safeInternalPath("   ")).toBe("/dashboard");
    expect(safeInternalPath(`/${"a".repeat(3000)}`)).toBe("/dashboard");
  });

  it("uses the fallback it was given", () => {
    expect(safeInternalPath("https://evil.example", "/plans")).toBe("/plans");
  });

  describe("with an origin, for the checkout return", () => {
    const origin = "https://getventurely.com";

    it("accepts this site's own absolute URL and reduces it to a path", () => {
      expect(safeInternalPath(`${origin}/plans/abc/export?unlocked=1`, "/dashboard", { origin }))
        .toBe("/plans/abc/export?unlocked=1");
    });

    it("still refuses somebody else's", () => {
      expect(safeInternalPath("https://evil.example/plans/abc", "/dashboard", { origin }))
        .toBe("/dashboard");
    });

    it("is not fooled by a lookalike host", () => {
      expect(safeInternalPath("https://getventurely.com.evil.example/x", "/dashboard", { origin }))
        .toBe("/dashboard");
    });
  });
});
