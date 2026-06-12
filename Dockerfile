# syntax=docker/dockerfile:1

FROM node:24-alpine AS build
WORKDIR /app

RUN apk upgrade --no-cache libcrypto3 libssl3

ARG SITE_URL
ARG SITE_URL_ALLOW_LOCALHOST
ENV SITE_URL=${SITE_URL} \
    SITE_URL_ALLOW_LOCALHOST=${SITE_URL_ALLOW_LOCALHOST}

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app

RUN apk upgrade --no-cache libcrypto3 libssl3

ARG APP_VERSION=0.1.0
ARG SOURCE_VERSION=unknown
ARG BUILD_TIME=unknown

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    APP_VERSION=${APP_VERSION} \
    SOURCE_VERSION=${SOURCE_VERSION} \
    BUILD_TIME=${BUILD_TIME}

RUN addgroup -S app && adduser -S app -G app

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server ./server
COPY --from=build /app/dist ./dist

USER app
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/healthz').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server/index.js"]
