# syntax=docker/dockerfile:1
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS base

# The virtualenv lives outside /app so the development bind mount
# (./backend:/app) never hides it behind the host's own .venv.
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH="/opt/venv/bin:$PATH"

WORKDIR /app

# Dependencies first: this layer is reused while only the code changes.
COPY pyproject.toml uv.lock .python-version ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-install-project

FROM base AS dev
COPY . .
EXPOSE 8000
CMD ["fastapi", "dev", "app/main.py", "--host", "0.0.0.0", "--port", "8000"]

# Production image: same locked dependencies as `base`, re-synced without the
# dev group (pytest/ruff never ship to the server), running as a non-root
# user, with only the code the running app actually needs (no tests/scripts).
FROM base AS prod
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --no-install-project

RUN groupadd --system app \
    && useradd --system --gid app --no-create-home --home-dir /app app

COPY app ./app
COPY migrations ./migrations
COPY alembic.ini ./
RUN chown -R app:app /app

USER app
EXPOSE 8000
# fastapi/starlette respond even while the DB is unreachable (see /health in
# app/main.py), so this only catches the process itself being wedged/dead.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)" || exit 1
CMD ["fastapi", "run", "app/main.py", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
