import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` throws on import outside a server component, which is
      // the point of it — but it makes server modules untestable. Stubbed so
      // the modules that carry the guard can still be exercised directly.
      "server-only": fileURLToPath(new URL("./tests/helpers/server-only.ts", import.meta.url)),
    },
  },
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
