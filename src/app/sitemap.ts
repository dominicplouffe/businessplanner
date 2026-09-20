import type { MetadataRoute } from "next";
import { brand } from "@/lib/brand";
import { PRODUCT_PAGES } from "@/lib/content/product";
import { INDUSTRY_PAGES } from "@/lib/content/industries";
import { TOOL_PAGES } from "@/lib/content/tools";

/* The sitemap is built from the content collections plus the handful of
   one-off routes, and deliberately NOT from nav.ts: the nav points ahead at
   pages that land in later phases, and a sitemap advertising a 404 is worse
   than a short one. Each collection is listed by the same array the routes are
   generated from, so a new industry or product page cannot be missed. */
const SINGLETONS: { path: string; priority: number; changeFrequency: "weekly" | "monthly" }[] = [
  { path: "", priority: 1, changeFrequency: "weekly" },
  { path: "/pricing", priority: 0.8, changeFrequency: "monthly" },
  { path: "/industries", priority: 0.8, changeFrequency: "monthly" },
  { path: "/tools", priority: 0.8, changeFrequency: "monthly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const entries = [
    ...SINGLETONS,
    ...PRODUCT_PAGES.map((p) => ({
      path: `/product/${p.slug}`,
      priority: 0.7,
      changeFrequency: "monthly" as const,
    })),
    ...INDUSTRY_PAGES.map((p) => ({
      path: `/industries/${p.slug}`,
      priority: 0.7,
      changeFrequency: "monthly" as const,
    })),
    ...TOOL_PAGES.map((t) => ({
      path: `/tools/${t.slug}`,
      priority: 0.7,
      changeFrequency: "monthly" as const,
    })),
  ];

  return entries.map((entry) => ({
    url: `${brand.url}${entry.path}`,
    lastModified: now,
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
  }));
}
