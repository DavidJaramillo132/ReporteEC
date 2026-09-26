"""Provenance shape shared by the meta and incident-detail endpoints."""

from pydantic import BaseModel


class SourceInfo(BaseModel):
    slug: str
    name: str
    publisher: str
    url: str | None
    license: str | None
