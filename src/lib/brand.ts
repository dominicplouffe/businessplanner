import { siteUrl } from "./env";

/**
 * Single source of truth for brand identity.
 *
 * Every user-visible reference reads from here — a rename is one edit to this
 * file. The URL is environment-driven because a staging deployment that
 * advertises production canonicals and sitemap entries is worse than useless
 * to a search engine.
 */
export const brand = {
  name: "Venturally",
  legalName: "Venturally, Inc.",
  domain: siteUrl.replace(/^https?:\/\//, ""),
  url: siteUrl,
  tagline: "The business plan your lender actually reads.",
  description:
    "Venturally builds investor- and lender-grade business plans on a real financial model — every number computed, every claim cited, every figure reconciled to the statements.",
  email: {
    hello: "hello@getventurely.com",
    support: "support@getventurely.com",
  },
  social: {
    x: "https://x.com/getventurely",
    linkedin: "https://www.linkedin.com/company/getventurely",
  },
} as const;

/** Pricing, kept beside the brand because the marketing site and the
 *  entitlement layer must never disagree about what a plan costs. */
export const pricing = {
  free: {
    name: "Draft",
    price: 0,
    blurb: "Generate a complete plan and read every page. No card, no watermark on screen.",
  },
  unlock: {
    name: "Plan",
    price: 199,
    cadence: "one-time" as const,
    blurb: "Unlock export and sharing for one finished plan. Yours permanently.",
  },
  live: {
    name: "Live",
    price: 39,
    cadence: "month" as const,
    blurb: "Keep the plan current: track actuals, re-forecast, and generate lender updates.",
  },
  guaranteeDays: 30,
} as const;
