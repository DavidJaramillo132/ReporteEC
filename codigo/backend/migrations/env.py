"""Alembic environment: URL from DATABASE_URL, metadata from every module."""

from logging.config import fileConfig

from alembic import context
from geoalchemy2 import alembic_helpers
from sqlalchemy import create_engine, pool

from app.core.config import database_url
from app.database.models import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _database_url() -> str:
    """DATABASE_URL, unless the caller (e.g. the test suite) set it programmatically."""
    return config.get_main_option("sqlalchemy.url") or database_url()


def include_object(obj, name, type_, reflected, compare_to):
    # Only manage tables declared in our models. The PostGIS image also ships
    # spatial_ref_sys and the tiger/topology schemas; never propose dropping them.
    if type_ == "table" and reflected and compare_to is None:
        return False
    # Lets GeoAlchemy2 manage the spatial indexes it creates with each geometry column.
    return alembic_helpers.include_object(obj, name, type_, reflected, compare_to)


COMMON_OPTIONS = {
    "target_metadata": target_metadata,
    "include_object": include_object,
    "process_revision_directives": alembic_helpers.writer,
    "render_item": alembic_helpers.render_item,
    "compare_type": True,
}


def run_migrations_offline() -> None:
    """Emit SQL to stdout instead of running it (alembic upgrade --sql)."""
    context.configure(
        url=_database_url(),
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        **COMMON_OPTIONS,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(_database_url(), poolclass=pool.NullPool)
    with engine.connect() as connection:
        context.configure(connection=connection, **COMMON_OPTIONS)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
