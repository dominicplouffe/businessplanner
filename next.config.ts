import type { NextConfig } from "next";

const config: NextConfig = {
  // A self-contained server bundle with only the dependencies it actually
  // reaches, which is what the container copies. Without it the image carries
  // the whole node_modules tree, Chromium included twice over.
  output: "standalone",
  /* Output tracing copies only the files it sees imported, and Playwright
     reads `browsers.json` through a path it computes at run time. Traced
     without it, the image's Playwright failed to load at all — and because
     the export route imports it, every export returned an empty 500, the
     spreadsheet and the documents along with the PDF. The whole package is a
     couple of megabytes more than the trace already carried. The Dockerfile
     checks the file is there, so a build that loses it fails. */
  outputFileTracingIncludes: {
    "/api/export/*": ["./node_modules/.pnpm/playwright-core@*/node_modules/playwright-core/**/*"],
  },
  reactStrictMode: true,
  poweredByHeader: false,
  // typedRoutes is deliberately off until the route surface is complete.
  // Nav data points at pages that land in the content phase; switching this on
  // earlier means casting every href, which defeats the point. Re-enable in the
  // polish phase, when every link resolves.
  typedRoutes: false,
  // The dev server treats a different host as cross-origin and blocks its dev
  // resources, which silently prevents hydration. Headless-browser checks hit
  // 127.0.0.1, so allow it explicitly. Dev-only; no effect on production.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  experimental: { optimizePackageImports: ["lucide-react"] },
};

export default config;
