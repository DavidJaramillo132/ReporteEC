"""GET /api/admin-units: provinces and cantons for the frontend's filter selects."""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.session import get_session
from app.modules.admin_units.models import AdminUnit, AdminUnitLevel
from app.modules.admin_units.schemas import AdminUnitOut, AdminUnitsResponse

router = APIRouter(prefix="/admin-units", tags=["admin-units"])


@router.get("", response_model=AdminUnitsResponse)
def list_admin_units(session: Session = Depends(get_session)) -> AdminUnitsResponse:
    rows = session.execute(
        select(AdminUnit.code, AdminUnit.level, AdminUnit.name, AdminUnit.province_code).order_by(
            AdminUnit.name
        )
    ).all()

    provinces = [
        AdminUnitOut.model_validate(row) for row in rows if row.level == AdminUnitLevel.PROVINCE
    ]
    cantons = [
        AdminUnitOut.model_validate(row) for row in rows if row.level == AdminUnitLevel.CANTON
    ]
    return AdminUnitsResponse(provinces=provinces, cantons=cantons)
