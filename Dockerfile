FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat

FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL="file:/tmp/build.db"
ENV SESSION_SECRET="build-time-placeholder-not-used-in-production"
RUN npx prisma generate
RUN npm run build

FROM base AS prod-deps
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm ci --omit=dev --legacy-peer-deps
RUN npx prisma generate

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=prod-deps /app/node_modules ./node_modules

COPY --from=builder /app/scripts/seed.mjs ./scripts/seed.mjs
COPY --from=builder /app/scripts/sync-head-to-head.mjs ./scripts/sync-head-to-head.mjs
COPY --from=builder /app/scripts/send-prediction-reminders.ts ./scripts/send-prediction-reminders.ts
COPY --from=builder /app/scripts/sync-match-statistics.mjs ./scripts/sync-match-statistics.mjs
COPY --from=builder /app/src/lib/email.ts ./src/lib/email.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json

COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["./entrypoint.sh"]
