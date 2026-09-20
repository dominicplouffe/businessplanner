/**
 * Rewrites the Prisma datasource provider.
 *
 * Prisma does not accept env() for `provider`, so the schema commits `sqlite`
 * (used for local development and tests) and the production build runs:
 *
 *   node scripts/set-db-provider.mjs postgresql
 *
 * Every model in the schema is provider-agnostic, so this single line is the
 * only difference between environments.
 */
import { readFileSync, writeFileSync } from "node:fs";

const ALLOWED = new Set(["sqlite", "postgresql"]);
const target = process.argv[2];

if (!ALLOWED.has(target)) {
  console.error(`Usage: node scripts/set-db-provider.mjs <${[...ALLOWED].join("|")}>`);
  process.exit(1);
}

const path = new URL("../prisma/schema.prisma", import.meta.url);
const source = readFileSync(path, "utf8");
const updated = source.replace(
  /(datasource db \{[^}]*?provider\s*=\s*")[^"]+(")/s,
  `$1${target}$2`,
);

if (updated === source) {
  console.log(`Provider already set to "${target}".`);
} else {
  writeFileSync(path, updated);
  console.log(`Prisma provider set to "${target}".`);
}
