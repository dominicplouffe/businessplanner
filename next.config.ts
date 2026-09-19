import type { NextConfig } from "next";

const config: NextConfig = {
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
