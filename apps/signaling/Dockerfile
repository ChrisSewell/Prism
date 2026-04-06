FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/protocol/package.json packages/protocol/
COPY apps/signaling/package.json apps/signaling/

RUN npm ci --workspace=packages/protocol --workspace=apps/signaling

COPY tsconfig.base.json tsconfig.json ./
COPY packages/protocol/ packages/protocol/
COPY apps/signaling/ apps/signaling/

RUN npm run build

FROM node:20-alpine
WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/packages/protocol/package.json packages/protocol/
COPY --from=builder /app/packages/protocol/dist/ packages/protocol/dist/
COPY --from=builder /app/apps/signaling/package.json apps/signaling/
COPY --from=builder /app/apps/signaling/dist/ apps/signaling/dist/

RUN npm ci --workspace=packages/protocol --workspace=apps/signaling --omit=dev

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "apps/signaling/dist/index.js"]
