"""Application settings read from the environment."""

import os
from functools import lru_cache


class MissingSettingError(RuntimeError):
    """Raised when a required environment variable is not set."""


@lru_cache
def database_url() -> str:
    """Return the SQLAlchemy URL of the PostGIS database.

    Docker Compose sets it for the backend container. Outside Docker, export
    it pointing at localhost, e.g.
    postgresql+psycopg://user:password@localhost:5432/reporteec
    """
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise MissingSettingError(
            "DATABASE_URL is not set. Run the backend through Docker Compose "
            "or export DATABASE_URL (driver postgresql+psycopg://)."
        )
    return url


# The Vite dev server (see docker-compose.yml) is reachable at either host.
DEFAULT_CORS_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]


@lru_cache
def cors_origins() -> list[str]:
    """Browser origins allowed to call the API.

    CORS_ORIGINS overrides the dev defaults with a comma-separated list, e.g.
    for a deployed frontend origin.
    """
    raw = os.environ.get("CORS_ORIGINS")
    if not raw:
        return DEFAULT_CORS_ORIGINS
    return [origin.strip() for origin in raw.split(",") if origin.strip()]
