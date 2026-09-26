"""The migrated test database matches what the models declare."""

from sqlalchemy import UniqueConstraint, inspect, text
from sqlalchemy.orm import Session

from app.database.base import Base


def test_migrations_create_the_expected_tables_and_postgis(db_session: Session):
    inspector = inspect(db_session.bind)
    tables = set(inspector.get_table_names())
    assert {"sources", "incidents", "detentions", "pipeline_runs"} <= tables

    postgis_installed = db_session.execute(
        text("SELECT 1 FROM pg_extension WHERE extname = 'postgis'")
    ).scalar()
    assert postgis_installed == 1


def test_naming_convention_matches_the_incidents_unique_constraint():
    incidents = Base.metadata.tables["incidents"]
    constraint_names = {
        constraint.name
        for constraint in incidents.constraints
        if isinstance(constraint, UniqueConstraint)
    }
    assert "uq_incidents_source_id_source_record_id" in constraint_names
