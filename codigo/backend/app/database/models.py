"""Import every model so Base.metadata knows all tables (used by Alembic)."""

from app.database.base import Base
from app.ingestion.models import PipelineRun
from app.modules.detentions.models import Detention
from app.modules.incidents.models import Incident
from app.modules.sources.models import Source
from app.modules.territory.models import AdminUnit, Canton, CantonIndicator, CantonPopulation

__all__ = [
    "AdminUnit",
    "Base",
    "Canton",
    "CantonIndicator",
    "CantonPopulation",
    "Detention",
    "Incident",
    "PipelineRun",
    "Source",
]
