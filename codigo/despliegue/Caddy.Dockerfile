# syntax=docker/dockerfile:1
#
# Builds the frontend's static production bundle, then serves it (plus the
# reverse proxy) from Caddy. Build context is codigo/ -- see
# codigo/despliegue/compose.prod.yml -- so every path below is relative to
# it, and codigo/.dockerignore keeps frontend/node_modules and
# frontend/dist out of the build context.
FROM docker.io/oven/bun:1 AS build
WORKDIR /app

# Dependencies first: this layer is reused while only the source changes.
COPY frontend/package.json frontend/bun.lock ./
RUN bun install --frozen-lockfile

COPY frontend/ .
# Same origin as the API/tiles in production (see despliegue/Caddyfile):
# the browser calls /api and /tiles on whatever domain Caddy serves, so no
# absolute backend URL is baked into the bundle.
ENV VITE_API_URL=""
ENV VITE_TILES_URL="/tiles"
RUN bun run build

FROM caddy:2
COPY despliegue/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
