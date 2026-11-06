# The battlechoc API (REST and the live match WebSocket) as an image. Every release publishes
# it to Docker Hub (.github/workflows/api-image.yml); a server runs it with
# deploy/docker-compose.yml and needs nothing else of this repository.
# Build from the repository root: docker build -f apps/api/Dockerfile .
# (the build context is trimmed by apps/api/Dockerfile.dockerignore)
ARG NODE_IMAGE=node:22.23.4-alpine3.24

# The dependencies are plain JavaScript (no install scripts, nothing compiled), so they are
# installed once on the build machine's own platform and copied into every target platform:
# an arm64 image needs no emulation.
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS deps
WORKDIR /app
# workspace manifests first for a cached dependency layer
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY apps/api/package.json ./apps/api/package.json
COPY apps/pwa/package.json ./apps/pwa/package.json
RUN npm ci --omit=dev --workspace apps/api --ignore-scripts

FROM ${NODE_IMAGE}
LABEL org.opencontainers.image.title="battlechoc API" \
      org.opencontainers.image.description="Backend of battlechoc: REST API and the live match WebSocket, on Postgres" \
      org.opencontainers.image.source="https://github.com/battlechoc/battlechoc" \
      org.opencontainers.image.licenses="AGPL-3.0-or-later"
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app ./
COPY packages/shared ./packages/shared
COPY apps/api/src ./apps/api/src
USER node
EXPOSE 8080
# /health answers without the database; Docker restarts nothing by itself, but `docker ps` and
# Compose (depends_on: service_healthy) see when the API stopped answering
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8080) + '/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "apps/api/src/server.js"]
