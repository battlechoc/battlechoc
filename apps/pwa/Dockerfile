# The game, built against one API and served by Caddy. Used by the local stack
# (deploy/docker-compose.local.yml); battlechoc.com itself is served from GitHub Pages.
# Build from the repository root: docker build -f apps/pwa/Dockerfile --build-arg VITE_API_URL=http://localhost .
FROM node:22-alpine AS build
WORKDIR /app
# workspace manifests first for a cached dependency layer
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY apps/api/package.json ./apps/api/package.json
COPY apps/pwa/package.json ./apps/pwa/package.json
RUN npm ci --workspace apps/pwa --ignore-scripts
COPY packages/shared ./packages/shared
COPY apps/pwa ./apps/pwa
# the API the game talks to, fixed at build time
ARG VITE_API_URL=http://localhost
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build --workspace apps/pwa

FROM caddy:2-alpine
COPY deploy/pwa.Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/pwa/build /srv
