FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/protocol/package.json packages/protocol/
COPY apps/web/package.json apps/web/

RUN npm ci --workspace=packages/protocol --workspace=apps/web

COPY tsconfig.base.json tsconfig.json ./
COPY packages/protocol/ packages/protocol/
COPY apps/web/ apps/web/

ARG VITE_SIGNALING_URL=""
ENV VITE_SIGNALING_URL=$VITE_SIGNALING_URL

RUN npm run build --workspace=apps/web

FROM nginx:stable-alpine

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1
