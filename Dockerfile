# syntax=docker/dockerfile:1

# ==========================================================================
# Venturally
# --------------------------------------------------------------------------
# Three stages. The final image carries the standalone server bundle, the
# Prisma engine, and Chromium — the PDF pipeline renders the live /print route
# through a real browser, so there is no version of this image without one.
#
# Chromium comes from Debian's archive rather than Playwright's download, so
# the image does not reach the network at build time for a browser and the
# version is whatever the base distribution pins. PLAYWRIGHT_* below points
# Playwright at it.
# ==========================================================================

ARG NODE_VERSION=22.22.0

# ---- deps ---------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
# A compiler, for one transitive native module. `@prisma/adapter-better-sqlite3`
# pulls better-sqlite3 12.x, which — unlike the 13.x we depend on directly —
# ships no prebuilt bindings in its tarball: its install script tries
# `prebuild-install` against GitHub releases and falls back to node-gyp. On a
# slim image that fallback finds no Python and fails the whole install, which is
# how this first broke. Building it locally removes the dependency on somebody
# else's release CDN being reachable from wherever the image is built.
#
# Production runs Postgres and never constructs the SQLite adapter, but the
# module is still imported, so the binding has to exist. The toolchain stays in
# this stage: the runtime image gets the compiled binding, not a compiler.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 \
      make \
      g++ \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY scripts ./scripts
# The postinstall runs `prisma generate`, which needs the schema — hence the
# copies above. The store mount keeps the layer cache useful across builds.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    PNPM_HOME=/pnpm pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile

# ---- build --------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The schema is committed as sqlite for local development. The client baked
# into this image must speak Postgres, so the provider is switched here and the
# change never leaves the image.
RUN node scripts/set-db-provider.mjs postgresql && pnpm exec prisma generate
# A Postgres URL, because the line above made the generated client a Postgres
# one and `src/lib/db.ts` picks its adapter from this variable. Leave it unset
# and the default SQLite URL selects the SQLite adapter, which Prisma rejects
# against a Postgres client — and it rejects it while Next is collecting page
# data, so the error names a route rather than the mismatch. Nothing connects
# during a build: this is a shape, not a database. The real URL arrives at run
# time from the task definition.
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
ENV NEXT_TELEMETRY_DISABLED=1
# Public values are inlined at build time by Next, so the origin has to be
# known here rather than at run time.
ARG NEXT_PUBLIC_SITE_URL=https://getventurely.com
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
RUN pnpm build

# ---- migrator -----------------------------------------------------------
# The Prisma CLI, installed on its own with npm.
#
# It cannot be lifted out of the pnpm tree. pnpm's node_modules is a symlink
# farm: `node_modules/prisma` points into the virtual store, and the CLI's own
# dependencies sit beside it there rather than at the top level — so copying
# `node_modules/prisma` into the runtime image produces a CLI that dies on
# `Cannot find module '@prisma/config'`. npm's tree is flat, which is exactly
# what a `COPY` can carry.
#
# The version is read from package.json so this cannot drift from the client the
# build generated.
FROM node:${NODE_VERSION}-bookworm-slim AS migrator
WORKDIR /migrate
COPY package.json ./app-package.json
RUN PRISMA_VERSION="$(node -p "require('./app-package.json').dependencies.prisma")" \
    && npm init -y > /dev/null \
    && npm install --no-audit --no-fund "prisma@${PRISMA_VERSION}" \
    && rm ./app-package.json

# ---- runtime ------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
WORKDIR /app

# Chromium and the fonts the document actually uses. Without the font packages
# the PDF renders in a fallback face and the typesetting the product sells is
# silently lost — the page still renders, which is what makes it easy to miss.
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      fonts-liberation \
      fonts-dejavu-core \
      ca-certificates \
      dumb-init \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# The standalone bundle carries only the dependencies the server actually
# reaches. `static` and `public` are not included in it and have to be copied
# alongside, which is the step everybody forgets and then serves a site with no
# CSS.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

# Migrations are applied by the entrypoint, so the schema, the migration files
# and a Prisma CLI have to be present at run time — not just at build time. The
# CLI comes from the migrator stage and keeps its own tree under /app/migrate, so
# it cannot be confused with the client the server uses.
COPY --from=build /app/prisma ./prisma
COPY docker/prisma.config.js ./prisma.config.js
COPY --from=migrator /migrate/node_modules ./migrate/node_modules
# The server's own Prisma packages. Output tracing bundles the adapter into the
# server chunks rather than leaving it in node_modules, so this is what makes
# `@prisma/adapter-pg` resolvable if it is reached at run time.
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY docker-entrypoint.sh /usr/local/bin/entrypoint
RUN chmod +x /usr/local/bin/entrypoint

# Chromium refuses to run as root without --no-sandbox; running as a real user
# means the sandbox stays on, which matters because this browser renders
# whatever a customer typed into their plan.
RUN useradd --system --uid 1001 --create-home app && chown -R app:app /app
USER app

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--", "entrypoint"]
CMD ["node", "server.js"]
