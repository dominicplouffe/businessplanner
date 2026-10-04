import type { MetadataRoute } from "next";
import { brand } from "@/lib/brand";

/* ==========================================================================
   Web app manifest.
   --------------------------------------------------------------------------
   The icon set's Android half: without it an installed shortcut falls back to
   a screenshot of the page, which is the blank-icon problem again one surface
   over. Everything here reads from brand.ts, so a rename stays one edit.

   The icons are the ones scripts/generate-icons.mjs renders from src/app/
   icon.svg — regenerate rather than hand-editing, or the home screen and the
   browser tab start to disagree.
   ========================================================================== */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${brand.name} — ${brand.tagline}`,
    short_name: brand.name,
    description: brand.description,
    start_url: "/",
    display: "standalone",
    /* The light surface, matching the light half of the root viewport's
       themeColor: an install lands on the marketing site, which is warm paper. */
    background_color: "#fbfaf7",
    theme_color: "#0b1220",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
