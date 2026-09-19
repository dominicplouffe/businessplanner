import type { MetadataRoute } from "next";
import { brand } from "@/lib/brand";
import { PRODUCT_PAGES } from "@/lib/content/product";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const staticPaths = ["", "/pricing"];
  const productPaths = PRODUCT_PAGES.map((p) => `/product/${p.slug}`);

  return [...staticPaths, ...productPaths].map((path) => ({
    url: `${brand.url}${path}`,
    lastModified: now,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : 0.7,
  }));
}
