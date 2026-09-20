/* ==========================================================================
   The container's Prisma config.
   --------------------------------------------------------------------------
   The repository's own `prisma.config.ts` is TypeScript and imports
   `dotenv/config`, because a developer's URL lives in a .env file. Neither
   belongs in a runtime image: loading a .ts config needs the TypeScript
   compiler, and the environment here comes from the task definition. So the
   image ships this instead, at the same path, and the entrypoint's
   `migrate deploy` reads it.

   Plain CommonJS on purpose, and with no imports at all — `prisma/config` is
   not resolvable from here, since the CLI keeps its own tree under
   /app/migrate. Prisma accepts the bare object, and the paths are relative to
   the working directory, which the entrypoint never changes.
   ========================================================================== */
module.exports = {
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // No fallback. The entrypoint refuses to start without DATABASE_URL, and a
  // default here would let a task migrate something other than its database.
  datasource: { url: process.env.DATABASE_URL },
};
