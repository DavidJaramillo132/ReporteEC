from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.modules.admin_units.models import AdminUnit, AdminUnitLevel


def test_lists_provinces_and_cantons(client: TestClient, db_session: Session):
    db_session.add_all(
        [
            AdminUnit(code="09", level=AdminUnitLevel.PROVINCE, name="Guayas", province_code=None),
            AdminUnit(
                code="0901", level=AdminUnitLevel.CANTON, name="Guayaquil", province_code="09"
            ),
        ]
    )
    db_session.commit()

    response = client.get("/api/admin-units")

    assert response.status_code == 200
    body = response.json()
    assert body["provinces"] == [{"code": "09", "name": "Guayas", "province_code": None}]
    assert body["cantons"] == [{"code": "0901", "name": "Guayaquil", "province_code": "09"}]
