# syntax=docker/dockerfile:1
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 8080
CMD ["npx", "tsx", "server/index.ts"]
