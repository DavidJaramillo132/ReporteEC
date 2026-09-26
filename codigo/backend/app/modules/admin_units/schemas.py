"""Response shapes for GET /api/admin-units."""

from pydantic import BaseModel, ConfigDict


class AdminUnitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    code: str
    name: str
    province_code: str | None


class AdminUnitsResponse(BaseModel):
    provinces: list[AdminUnitOut]
    cantons: list[AdminUnitOut]
