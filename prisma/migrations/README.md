# Migrations

These are **Postgres** migrations, for production. They are generated against
the schema with its provider set to `postgresql`, which is not how the schema is
committed.

Local development uses SQLite and `pnpm db:push`, which needs no migration
history: the dev database is disposable and a migration per schema tweak would
be noise. Production is the opposite — `prisma migrate deploy` applies exactly
these files, in order, and never infers anything.

## Adding one

```
pnpm db:provider postgresql
pnpm exec prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema prisma/schema.prisma \
  --script > prisma/migrations/<timestamp>_<name>/migration.sql
pnpm db:provider sqlite        # leave the schema as it is committed
```

The commit must leave `provider = "sqlite"` in `schema.prisma`. The container
build runs `db:provider postgresql` itself before generating the client, so the
two are only ever out of step inside the image.

## Applying them

The container runs `prisma migrate deploy` on start, before the server binds.
A failed migration stops the task rather than serving traffic against a schema
it does not match.
