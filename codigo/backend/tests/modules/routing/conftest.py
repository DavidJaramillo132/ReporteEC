from collections.abc import Iterator

import pytest

from app.main import app
from app.modules.routing.router import get_osrm_client
from app.modules.routing.service import clear_caches


@pytest.fixture(autouse=True)
def _fresh_route_caches() -> Iterator[None]:
    """Each test sees its own data: no national context or route cached from another."""
    clear_caches()
    yield
    clear_caches()
    app.dependency_overrides.pop(get_osrm_client, None)
