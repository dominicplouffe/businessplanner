#!/bin/sh
# Applies migrations, then hands off to the server.
#
# Deliberately blocking: a task that starts serving traffic against a schema it
# does not match will write rows that the next deploy cannot read. Failing here
# means the deployment stalls with a clear error, which is the cheaper outcome.
set -e

# Compose DATABASE_URL when the parts were supplied instead.
#
# Nothing in RDS or Secrets Manager produces a connection URL: the secret holds
# `username` and `password`, and attaching it to the instance adds `host`,
# `port`, `dbname` and friends. Asking ECS to inject a `uri` key stopped every
# task from starting with
#
#   retrieved secret from Secrets Manager did not contain json key uri
#
# so the task definition now passes the credentials as secrets and the endpoint
# as plain environment, and the URL is assembled here.
#
# Interpolating the password directly is safe by construction: the generated
# password excludes every character that is significant in a URL — see
# `excludeCharacters` on DbSecret in infra/lib/site-stack.ts. Do not relax that
# set without encoding here.
#
# An explicit DATABASE_URL always wins, which is what docker-compose and any
# local run rely on.
if [ -z "$DATABASE_URL" ] && [ -n "$DB_HOST" ]; then
  export DATABASE_URL="postgresql://${DB_USERNAME}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
fi

if [ -n "$DATABASE_URL" ]; then
  echo "Applying migrations…"
  # The CLI has its own flat dependency tree — see the migrator stage in the
  # Dockerfile for why it cannot share the server's.
  node migrate/node_modules/prisma/build/index.js migrate deploy
else
  echo "DATABASE_URL is not set, and DB_HOST was not supplied to build one." >&2
  echo "Refusing to start." >&2
  exit 1
fi

exec "$@"
