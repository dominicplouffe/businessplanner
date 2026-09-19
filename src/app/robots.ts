import type { MetadataRoute } from "next";
import { brand } from "@/lib/brand";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // The app and share links are per-user; there is nothing there to index.
      { userAgent: "*", allow: "/", disallow: ["/api/", "/app/", "/share/", "/print/"] },
    ],
    sitemap: `${brand.url}/sitemap.xml`,
  };
}
