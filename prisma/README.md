# Database

SQLite for local development and tests, PostgreSQL in production. Every model in
`schema.prisma` is provider-agnostic — no native enums, no scalar lists, no
database-specific column types — so the schema itself never changes between
environments.

## The one non-portable line

Prisma rejects `env()` for the datasource `provider`, so it is committed as
`sqlite` and the production build rewrites it:

```bash
pnpm db:provider postgresql
```

Nothing else in the schema differs. The runtime connection comes from a **driver
adapter** in `src/lib/db.ts` (Prisma 7 removed `url` from the schema), so
switching to Postgres means swapping `PrismaBetterSqlite3` for `PrismaPg` there
and running the command above.

## Commands

```bash
pnpm db:push        # sync schema to the database (development)
pnpm db:generate    # regenerate the client
pnpm db:studio      # browse the data
```

`prisma generate` also runs on `postinstall`, because the generated client lives
in `node_modules` and pnpm prunes it on install.

## Two shapes, two columns

`Plan` stores intake state in two places on purpose:

- `contextJson.intakeState` — the flat wizard answers, always authoritative
- `assumptionsJson` — the mapped, Zod-validated `Assumptions` object

They are never merged. Keeping them in one column allowed a late autosave to
write flat keys over a completed model and silently downgrade the plan back to
"intake" — a race that is easy to reintroduce and hard to spot.
