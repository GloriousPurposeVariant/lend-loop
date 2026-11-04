# Images for the full Docker stack (docker-compose.full.yml).
#   tools: the repo and its dependencies. Deploys Convex, seeds data, runs admin commands.
#   web:   the production Next.js server, built from tools.

FROM node:24.13.1-bookworm-slim@sha256:a81a03dd965b4052269a57fac857004022b522a4bf06e7a739e25e18bce45af2 AS base

FROM base AS tools
WORKDIR /app
# The git hook installer has nothing to do here: there is no .git inside the image.
ENV HUSKY=0
# Dependencies first, from the manifests only, so this slow layer is reused until a
# package.json or the lockfile changes.
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY services/core/package.json services/core/
RUN npm ci
COPY . .

FROM tools AS web-build
# NEXT_PUBLIC_* values are compiled into the browser code, so they are build arguments.
ARG NEXT_PUBLIC_CONVEX_URL
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
RUN npm run build -w @lendloop/web

# Only the standalone server and its static files: no source, no dev dependencies.
FROM base AS web
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=web-build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=web-build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
