# syntax=docker/dockerfile:1
FROM docker.io/oven/bun:1 AS base
WORKDIR /app

# Dependencies first: this layer is reused while only the code changes.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM base AS dev
COPY . .
EXPOSE 5173
CMD ["bunx", "--bun", "vite", "--host", "0.0.0.0", "--port", "5173"]
