#!/bin/sh
# Applies migrations, then hands off to the server.
#
# Deliberately blocking: a task that starts serving traffic against a schema it
# does not match will write rows that the next deploy cannot read. Failing here
# means the deployment stalls with a clear error, which is the cheaper outcome.
set -e

if [ -n "$DATABASE_URL" ]; then
  echo "Applying migrations…"
  # The CLI has its own flat dependency tree — see the migrator stage in the
  # Dockerfile for why it cannot share the server's.
  node migrate/node_modules/prisma/build/index.js migrate deploy
else
  echo "DATABASE_URL is not set; refusing to start." >&2
  exit 1
fi

exec "$@"
