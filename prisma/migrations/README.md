# Migrations

These are **Postgres** migrations, for production. They are generated against
the schema with its provider set to `postgresql`, which is not how the schema is
committed.

Local development uses SQLite and `pnpm db:push`, which needs no migration
history: the dev database is disposable and a migration per schema tweak would
be noise. Production is the opposite — `prisma migrate deploy` applies exactly
these files, in order, and never infers anything.

## Adding one

Diff the committed schema against the new one, both read as Postgres. This
needs no database and no `migration_lock.toml` — `--from-migrations` needs
both, and this repository has neither:

```
git show HEAD:prisma/schema.prisma | sed 's/provider = "sqlite"/provider = "postgresql"/' > /tmp/old.prisma
sed 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma > /tmp/new.prisma
mkdir prisma/migrations/<timestamp>_<name>
pnpm exec prisma migrate diff --from-schema /tmp/old.prisma --to-schema /tmp/new.prisma \
  --script > prisma/migrations/<timestamp>_<name>/migration.sql
```

The same command with `--from-empty` reproduces `20260920000000_init` byte for
byte, which is how to check the method still holds.

The commit must leave `provider = "sqlite"` in `schema.prisma`. The container
build runs `db:provider postgresql` itself before generating the client, so the
two are only ever out of step inside the image.

## Applying them

The container runs `prisma migrate deploy` on start, before the server binds.
A failed migration stops the task rather than serving traffic against a schema
it does not match.
