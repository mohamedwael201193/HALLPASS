# HALLPASS backend — minimal node image running API + indexer.
# Build context: ~/workspace/hallpass-build/backend
# Expects: ./api/package.json with "start": "node server.js"
#          ./indexer/index.js
# Runtime config comes from env vars only (see ../.env.example); the image
# itself carries no secrets.

FROM node:20-alpine

WORKDIR /app

# Install deps first for layer caching.
# NOTE: a package.json must exist at backend/package.json (shared deps)
# or adjust these COPY lines to each service's own package.json.
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

COPY api ./api
COPY indexer ./indexer
COPY start.sh ./start.sh
RUN chmod +x ./start.sh

# Render / any host injects PORT; default for local runs.
ENV PORT=8787
EXPOSE 8787

CMD ["./start.sh"]
