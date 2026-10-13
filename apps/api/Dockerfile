# Build from the repository root: docker build -f apps/api/Dockerfile .
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
# workspace manifests first for a cached dependency layer
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY apps/api/package.json ./apps/api/package.json
COPY apps/pwa/package.json ./apps/pwa/package.json
RUN npm ci --omit=dev --workspace apps/api --ignore-scripts
COPY packages/shared ./packages/shared
COPY apps/api/src ./apps/api/src
USER node
EXPOSE 8080
CMD ["node", "apps/api/src/server.js"]
