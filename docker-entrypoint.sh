#!/bin/sh
# Applies migrations, then hands off to the server.
#
# Deliberately blocking: a container that starts serving traffic against a
# schema it does not match will write rows that the next deploy cannot read.
# Failing here means the deploy stops with a clear error, which is the cheaper
# outcome — scripts/lightsail.sh runs this once on its own (`docker compose run
# --rm web true`) before starting the new release, so a failed migration stops
# the deploy while the previous release is still serving.
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL is not set. Refusing to start." >&2
  exit 1
fi

echo "Applying migrations…"
# The CLI has its own flat dependency tree — see the migrator stage in the
# Dockerfile for why it cannot share the server's.
node migrate/node_modules/prisma/build/index.js migrate deploy

exec "$@"
