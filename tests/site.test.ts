import { describe, expect, it } from "vitest";
import { footerNav, legalNav, productNav, resourcesNav, solutionsNav } from "@/lib/nav";
import { PRODUCT_PAGES } from "@/lib/content/product";
import { INDUSTRY_PAGES } from "@/lib/content/industries";
import { TOOL_PAGES } from "@/lib/content/tools";
import { LEGAL_DOCUMENTS } from "@/lib/content/legal";
import { SOLUTION_PAGES } from "@/lib/content/solutions";
import { ARTICLES } from "@/lib/content/learn";
import { EXAMPLE_PLANS } from "@/lib/content/examples";
import { COMPARE_PAGES, SHARED_QUESTIONS } from "@/lib/content/compare";
import { GLOSSARY_TERMS, termAnchor } from "@/lib/content/glossary";
import { buildExample } from "@/lib/content/examples";
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
  "/learn",
  "/learn/glossary",
  "/learn/methodology",
  "/examples",
  "/compare",
  ...PRODUCT_PAGES.map((p) => `/product/${p.slug}`),
  ...INDUSTRY_PAGES.map((p) => `/industries/${p.slug}`),
  ...TOOL_PAGES.map((t) => `/tools/${t.slug}`),
  ...LEGAL_DOCUMENTS.map((d) => `/legal/${d.slug}`),
  ...SOLUTION_PAGES.map((s) => `/solutions/${s.slug}`),
  ...ARTICLES.map((a) => `/learn/${a.slug}`),
  ...EXAMPLE_PLANS.map((e) => `/examples/${e.slug}`),
  ...COMPARE_PAGES.map((c) => `/compare/${c.slug}`),
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
      ARTICLES.map((a) => `/learn/${a.slug}`),
      EXAMPLE_PLANS.map((e) => `/examples/${e.slug}`),
      COMPARE_PAGES.map((c) => `/compare/${c.slug}`),
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

describe("learn articles", () => {
  it("has unique slugs, a summary and related links", () => {
    const slugs = ARTICLES.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const article of ARTICLES) {
      expect(article.sections.length, article.slug).toBeGreaterThan(2);
      expect(article.summary.length, article.slug).toBeGreaterThan(40);
      expect(article.related.length, article.slug).toBeGreaterThan(0);
    }
  });

  it("only links internally to routes that exist", () => {
    const links = [
      ...ARTICLES.flatMap((a) => a.related.map((r) => r.href)),
      ...GLOSSARY_TERMS.flatMap((t) => (t.link ? [t.link.href] : [])),
    ];
    for (const href of links) {
      const path = href.split("#")[0]!;
      expect(BUILT_PATHS.has(path), href).toBe(true);
    }
  });

  it("gives every glossary term a unique anchor", () => {
    const anchors = GLOSSARY_TERMS.map(termAnchor);
    expect(new Set(anchors).size).toBe(anchors.length);
    for (const anchor of anchors) expect(anchor).toMatch(/^[a-z0-9-]+$/);
  });
});

describe("comparison pages", () => {
  /* These pages exist because the vendors' own pages are unreachable from the
     build environment. Restating a price we could not verify would contradict
     the rule the product is sold on, so the pages state facts about exactly one
     product — ours — and everything about the alternative is a question. */
  it("states no competitor price anywhere", () => {
    const prose = COMPARE_PAGES.flatMap((p) => [
      p.title,
      p.lede,
      p.noTableReason,
      p.whyConsidered,
      ...p.whenNotUs,
      ...p.questions.flatMap((q) => [q.question, q.why, q.ourAnswer]),
    ]).join(" ");
    expect(prose).not.toMatch(/\$\s?\d/);
    expect(prose).not.toMatch(/\d+\s?(?:\/|per )\s?(?:mo|month|user)/i);
  });

  it("answers every shared question on every page", () => {
    expect(SHARED_QUESTIONS.length).toBeGreaterThan(5);
    for (const q of SHARED_QUESTIONS) {
      expect(q.ourAnswer.length, q.question).toBeGreaterThan(60);
      expect(q.why.length, q.question).toBeGreaterThan(40);
    }
    for (const page of COMPARE_PAGES) {
      // Every page must make the case against itself too.
      expect(page.whenNotUs.length, page.slug).toBeGreaterThan(1);
      expect(page.competitorUrl).toMatch(/^https:\/\//);
      // And must say, in its own words, why there is no table.
      expect(page.noTableReason.length, page.slug).toBeGreaterThan(80);
    }
  });
});

describe("sample plans", () => {
  const built = EXAMPLE_PLANS.map((e) => buildExample(e));

  it("writes every section, and reconciles every figure to the model", () => {
    for (const { example, doc, review } of built) {
      expect(doc.sections.every((s) => s.written), example.slug).toBe(true);
      // The samples are the product's own output on public display. A figure in
      // one of them that does not trace to the model would be the worst
      // possible advertisement for a consistency checker.
      expect(review.consistency.findings, example.slug).toEqual([]);
      expect(review.consistency.checkedCount, example.slug).toBeGreaterThan(20);
    }
  });

  it("ties the balance sheet in every period", () => {
    for (const { example, doc } of built) {
      expect(doc.model.checks.balanceSheetTie.passes, example.slug).toBe(true);
    }
  });

  it("carries no invented competitor and no invented citation", () => {
    for (const { example, doc } of built) {
      expect(doc.market.competitors, example.slug).toEqual([]);
      expect(doc.citations, example.slug).toEqual([]);
    }
  });

  it("blocks exactly on the missing competitive evidence, and only where it matters", () => {
    for (const { example, review } of built) {
      const blocking = review.validation.findings
        .filter((f) => f.severity === "blocking")
        .map((f) => f.id);
      // An internal plan is not read for competitive evidence, so it clears.
      const expected = example.purpose === "internal" ? [] : ["insufficient-competitor-evidence"];
      expect(blocking, example.slug).toEqual(expected);
    }
  });

  it("is reproducible: the same source builds the same document", () => {
    for (const example of EXAMPLE_PLANS) {
      const a = buildExample(example);
      const b = buildExample(example);
      expect(a.doc.sections, example.slug).toEqual(b.doc.sections);
      expect(a.doc.preparedOn).toBe(b.doc.preparedOn);
    }
  });
});

/* ==========================================================================
   One spelling of the domain.
   --------------------------------------------------------------------------
   Three near-misses coexisted in this repo before the domain was settled: the
   brand word *Venturally*, a placeholder origin, and social handles, none of
   which matched. The brand word is allowed to differ from the domain — it is a
   different string on purpose. The domain is not allowed to differ from itself,
   and a review comment is not what stops that recurring.
   ========================================================================== */
describe("the domain", () => {
  const ROOTS = ["src", "public", "infra/bin", "infra/lib", ".github/workflows"];
  const FILES = ["README.md", "DEPLOY.md", "CLAUDE.md", "Dockerfile", ".env.example"];
  const WRONG = /getventur(?!ely\b)[a-z]*\.com/gi;

  async function collect(dir: string, out: string[]): Promise<string[]> {
    const { readdir } = await import("node:fs/promises");
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) await collect(path, out);
      else out.push(path);
    }
    return out;
  }

  it("is spelled getventurely.com everywhere it appears", async () => {
    const { readFile } = await import("node:fs/promises");
    const paths: string[] = [...FILES];
    for (const root of ROOTS) await collect(root, paths);

    const offenders: string[] = [];
    for (const path of paths) {
      const text = await readFile(path, "utf8");
      for (const hit of text.match(WRONG) ?? []) offenders.push(`${path}: ${hit}`);
    }
    expect(offenders).toEqual([]);
  });

  it("derives the brand domain from the origin rather than restating it", () => {
    expect(brand.domain).toBe(brand.url.replace(/^https?:\/\//, ""));
  });
});
