import { describe, expect, it } from "vitest";
import { footerNav, legalNav, productNav, resourcesNav, solutionsNav } from "@/lib/nav";
import { PRODUCT_PAGES } from "@/lib/content/product";
import { INDUSTRY_PAGES } from "@/lib/content/industries";
import { TOOL_PAGES } from "@/lib/content/tools";
import { LEGAL_DOCUMENTS } from "@/lib/content/legal";
import { SOLUTION_PAGES } from "@/lib/content/solutions";
import sitemap from "@/app/sitemap";
import { brand } from "@/lib/brand";

/* ==========================================================================
   The public route surface.
   --------------------------------------------------------------------------
   The nav used to point at sixteen routes that did not exist, on a site whose
   whole positioning is credibility. These tests hold the line: every link in
   the navigation resolves to a page the build actually generates, and the
   sitemap advertises exactly those pages and nothing else.
   ========================================================================== */

/** Every path the build generates, derived from the same collections the routes
 *  are generated from. Update this when a route is added, which is the point. */
const BUILT_PATHS = new Set<string>([
  "/",
  "/pricing",
  "/about",
  "/security",
  "/changelog",
  "/contact",
  "/industries",
  "/tools",
  "/learn/methodology",
  ...PRODUCT_PAGES.map((p) => `/product/${p.slug}`),
  ...INDUSTRY_PAGES.map((p) => `/industries/${p.slug}`),
  ...TOOL_PAGES.map((t) => `/tools/${t.slug}`),
  ...LEGAL_DOCUMENTS.map((d) => `/legal/${d.slug}`),
  ...SOLUTION_PAGES.map((s) => `/solutions/${s.slug}`),
]);

describe("navigation", () => {
  const navLinks = [
    ...productNav,
    ...solutionsNav,
    ...resourcesNav,
    ...legalNav,
    ...footerNav.flatMap((g) => g.links),
  ];

  it("only links to routes that exist", () => {
    for (const link of navLinks) {
      expect(BUILT_PATHS.has(link.href), `${link.label} -> ${link.href}`).toBe(true);
    }
  });

  it("gives every nav link a distinct label within its group", () => {
    for (const group of footerNav) {
      const labels = group.links.map((l) => l.label);
      expect(new Set(labels).size, group.heading).toBe(labels.length);
    }
  });
});

describe("sitemap", () => {
  const entries = sitemap();

  it("advertises only routes that exist", () => {
    for (const entry of entries) {
      const path = entry.url.replace(brand.url, "");
      expect(BUILT_PATHS.has(path || "/"), entry.url).toBe(true);
    }
  });

  it("lists every content collection in full", () => {
    const paths = new Set(entries.map((e) => e.url.replace(brand.url, "") || "/"));
    for (const collection of [
      PRODUCT_PAGES.map((p) => `/product/${p.slug}`),
      INDUSTRY_PAGES.map((p) => `/industries/${p.slug}`),
      TOOL_PAGES.map((t) => `/tools/${t.slug}`),
      SOLUTION_PAGES.map((s) => `/solutions/${s.slug}`),
      LEGAL_DOCUMENTS.map((d) => `/legal/${d.slug}`),
    ]) {
      for (const path of collection) expect(paths.has(path), path).toBe(true);
    }
  });

  it("has no duplicate urls", () => {
    const urls = entries.map((e) => e.url);
    expect(new Set(urls).size).toBe(urls.length);
  });
});

describe("solutions content", () => {
  it("carries a standing notice on the compliance-sensitive page", () => {
    const immigration = SOLUTION_PAGES.find((s) => s.slug === "immigration")!;
    expect(immigration.notice).toBeTruthy();
    expect(immigration.notice).toMatch(/does not provide legal advice|not a substitute/i);
  });

  it("states no dollar threshold and no numeric job requirement", () => {
    // Both are in the verification queue, and E-2 has no job-creation quota at
    // all. Asserting a figure here would be the worst kind of defect in this
    // segment, so the page must not contain one.
    const prose = SOLUTION_PAGES.flatMap((s) => [
      s.lede,
      s.promise,
      s.notice ?? "",
      ...s.sections.flatMap((sec) => [sec.body, ...(sec.points ?? [])]),
      ...s.reader.items.flatMap((i) => [i.title, i.detail]),
      ...s.limits,
    ]).join(" ");
    expect(prose).not.toMatch(/\$\s?\d/);
    expect(prose).not.toMatch(/\b(ten|10)\s+(full-time\s+)?jobs\b/i);
  });

  it("states limits on every solution page", () => {
    for (const page of SOLUTION_PAGES) {
      expect(page.limits.length, page.slug).toBeGreaterThan(0);
      expect(page.sections.length, page.slug).toBeGreaterThan(2);
    }
  });
});
