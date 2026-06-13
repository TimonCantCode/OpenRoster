FROM node:20-bookworm-slim AS dependencies
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS builder
WORKDIR /app
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV APP_URL=http://localhost:3000
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs openroster
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder --chown=openroster:nodejs /app/package.json /app/package-lock.json ./
COPY --from=builder --chown=openroster:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=openroster:nodejs /app/.next ./.next
COPY --from=builder --chown=openroster:nodejs /app/prisma ./prisma
COPY --from=builder --chown=openroster:nodejs /app/docker ./docker
RUN chmod +x ./docker/entrypoint.sh
USER openroster
EXPOSE 3000
ENV PORT=3000
ENTRYPOINT ["./docker/entrypoint.sh"]
