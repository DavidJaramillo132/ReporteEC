"""Shared fixtures: a disposable Postgres database migrated to head.

Nothing here runs until a test actually requests `db_session` (or one of the
fixtures it depends on) -- tests that only exercise pure functions never touch
the database.
"""

import os
from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.core.config import database_url

# Importing app.database.models (not just app.database.base) registers every
# module's tables on Base.metadata, regardless of which fixtures a test uses.
from app.database.models import Base

BACKEND_DIR = Path(__file__).resolve().parent.parent


def _test_database_url() -> str:
    """The URL of the disposable database used by the test suite.

    Derived from DATABASE_URL by appending "_test" to the database name, so
    the test suite never touches the development database. TEST_DATABASE_URL
    overrides this when the two must differ (e.g. a shared CI Postgres).
    """
    override = os.environ.get("TEST_DATABASE_URL")
    if override:
        return override
    url = make_url(database_url())
    test_url = url.set(database=f"{url.database}_test")
    # Plain str(url) masks the password ("***"); render_as_string keeps it.
    return test_url.render_as_string(hide_password=False)


@pytest.fixture(scope="session")
def test_database_url() -> str:
    return _test_database_url()


@pytest.fixture(scope="session")
def _migrated_database(test_database_url: str) -> Iterator[str]:
    """Drop, recreate and migrate the test database once per test session."""
    url = make_url(test_database_url)
    admin_url = url.set(database="postgres")

    admin_engine = create_engine(admin_url, isolation_level="AUTOCOMMIT")
    try:
        with admin_engine.connect() as connection:
            # FORCE drops the database even if a previous, undisposed engine
            # left idle connections open against it.
            connection.execute(text(f'DROP DATABASE IF EXISTS "{url.database}" WITH (FORCE)'))
            connection.execute(text(f'CREATE DATABASE "{url.database}"'))
    finally:
        admin_engine.dispose()

    alembic_cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    alembic_cfg.set_main_option("sqlalchemy.url", test_database_url)
    command.upgrade(alembic_cfg, "head")

    yield test_database_url


@pytest.fixture
def db_session(_migrated_database: str) -> Iterator[Session]:
    """A Session bound to the test database, truncated after every test."""
    engine = create_engine(_migrated_database)
    session = Session(bind=engine)
    try:
        yield session
    finally:
        session.close()
        _truncate_all_tables(engine)
        engine.dispose()


def _truncate_all_tables(engine) -> None:
    tables = ", ".join(f'"{table.name}"' for table in Base.metadata.sorted_tables)
    if not tables:
        return
    with engine.connect() as connection:
        connection.execute(text(f"TRUNCATE TABLE {tables} RESTART IDENTITY CASCADE"))
        connection.commit()
