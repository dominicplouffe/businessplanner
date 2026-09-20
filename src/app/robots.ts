import type { MetadataRoute } from "next";
import { brand } from "@/lib/brand";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // The app and share links are per-user; there is nothing there to index.
      // These are the real authenticated paths — there is no /app/ prefix, and
      // disallowing one left the whole product crawlable.
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/dashboard", "/plans/", "/settings/", "/share/", "/print/"],
      },
    ],
    sitemap: `${brand.url}/sitemap.xml`,
  };
}
