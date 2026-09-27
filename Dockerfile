# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
WORKDIR /app

# --- build: full deps + compile ---
FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY db ./db
RUN npm run build

# --- prod-deps: runtime dependencies only ---
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# --- runtime ---
FROM base AS runtime
ENV NODE_ENV=production
# package.json must sit in the working directory: AppService reads it for GET /.
COPY package.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# db/migrations + drizzle.config.ts ship so `npm run db:migrate` can run
# against this image right before `docker compose up -d api`.
COPY drizzle.config.ts ./
COPY db/migrations ./db/migrations
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.SERVER_APP_HTTP_PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/src/main"]
