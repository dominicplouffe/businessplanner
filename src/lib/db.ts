import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";
import { databaseKind, databaseUrl } from "./env";

/**
 * Prisma 7 takes a driver adapter rather than a connection URL in the schema.
 * That is what lets one schema serve SQLite locally and Postgres in production.
 *
 * The adapter is chosen from the URL rather than from a separate flag, so there
 * is one thing to get right instead of two that can disagree. `pnpm db:provider
 * postgresql` rewrites the schema's provider line to match before generating.
 */
function createClient() {
  const adapter =
    databaseKind === "postgres"
      ? new PrismaPg({ connectionString: databaseUrl })
      : new PrismaBetterSqlite3({ url: databaseUrl });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

// Next's dev server re-evaluates modules on every change; without this the
// connection pool grows until SQLite starts refusing handles.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
