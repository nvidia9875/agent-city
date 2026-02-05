# syntax=docker/dockerfile:1
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_AI_ENABLED
ARG NEXT_PUBLIC_WS_URL
ARG NEXT_PUBLIC_SIM_LOG_LEVEL
ENV NEXT_PUBLIC_AI_ENABLED=$NEXT_PUBLIC_AI_ENABLED
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_SIM_LOG_LEVEL=$NEXT_PUBLIC_SIM_LOG_LEVEL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
EXPOSE 8080
CMD ["sh", "-c", "npm run start -- -p ${PORT:-8080} -H 0.0.0.0"]
