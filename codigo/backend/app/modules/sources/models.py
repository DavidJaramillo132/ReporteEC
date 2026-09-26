"""Where every record comes from. Provenance is the product."""

from sqlalchemy import SmallInteger, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, TimestampMixin


class Source(TimestampMixin, Base):
    __tablename__ = "sources"

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    # Stable key used by the code and the ingestion adapters, e.g. "mdi-homicidios".
    slug: Mapped[str] = mapped_column(String(64), unique=True)
    name: Mapped[str] = mapped_column(Text)
    publisher: Mapped[str] = mapped_column(Text)
    url: Mapped[str | None] = mapped_column(Text)
    license: Mapped[str | None] = mapped_column(Text)
