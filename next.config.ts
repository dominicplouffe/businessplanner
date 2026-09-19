import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // typedRoutes is deliberately off until the route surface is complete.
  // Nav data points at pages that land in the content phase; switching this on
  // earlier means casting every href, which defeats the point. Re-enable in the
  // polish phase, when every link resolves.
  typedRoutes: false,
  experimental: { optimizePackageImports: ["lucide-react", "recharts"] },
};

export default config;
