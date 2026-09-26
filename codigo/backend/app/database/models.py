"""Import every model so Base.metadata knows all tables (used by Alembic)."""

from app.database.base import Base
from app.modules.detentions.models import Detention
from app.modules.incidents.models import Incident
from app.modules.ingestion.models import PipelineRun
from app.modules.sources.models import Source

__all__ = ["Base", "Detention", "Incident", "PipelineRun", "Source"]
