"""CKAN client: discover and download official dataset resources.

datosabiertos.gob.ec exposes each dataset ("package") through the CKAN
Action API. A package bundles several resources; the homicides dataset
ships one XLSX per record ("_pm_", per movimiento/registro) alongside
data-dictionary XLSX files ("_dd_") that must never be loaded as data.
"""

import logging
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

import httpx

logger = logging.getLogger(__name__)

CKAN_BASE_URL = "https://www.datosabiertos.gob.ec"
HOMICIDIOS_PACKAGE_ID = "homicidios-intencionales"


@dataclass(frozen=True, slots=True)
class Resource:
    id: str
    name: str
    format: str
    url: str
    size: int | None = None


def _resources_from_payload(payload: dict) -> list[Resource]:
    """Pure parsing step, kept apart from the HTTP call so tests need no network."""
    return [
        Resource(
            id=item["id"],
            name=item.get("name", ""),
            format=item.get("format", ""),
            url=item["url"],
            size=item.get("size"),
        )
        for item in payload["result"]["resources"]
    ]


def package_resources(package_id: str, *, base_url: str = CKAN_BASE_URL) -> list[Resource]:
    """Resources declared by a CKAN package, in the order the API returns them."""
    response = httpx.get(
        f"{base_url}/api/3/action/package_show",
        params={"id": package_id},
        timeout=30.0,
    )
    response.raise_for_status()
    return _resources_from_payload(response.json())


def resource_filename(resource: Resource) -> str:
    """The actual downloaded file name, taken from the URL path.

    The CKAN "name" field is a free-text display label -- observed with
    stray Unicode characters from copy-pasted uploads -- while the URL path
    is what the government's own download link resolves to, so it is the
    reliable source of the real file name.
    """
    return Path(urlparse(resource.url).path).name


def is_per_record_resource(resource: Resource) -> bool:
    """True for a per-record ("_pm_") XLSX resource, false for a data dictionary ("_dd_")."""
    name = resource_filename(resource).lower()
    return name.endswith(".xlsx") and "_pm_" in name


def select_homicide_resources(resources: list[Resource]) -> list[Resource]:
    return [resource for resource in resources if is_per_record_resource(resource)]


def download(resource: Resource, dest_dir: Path) -> Path:
    """Download a resource into dest_dir, skipping it if already present with the same size."""
    dest_dir = Path(dest_dir)
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / resource_filename(resource)
    if dest.exists() and resource.size is not None and dest.stat().st_size == resource.size:
        logger.info("skip download, already present: %s", dest)
        return dest

    with httpx.stream("GET", resource.url, timeout=60.0, follow_redirects=True) as response:
        response.raise_for_status()
        with dest.open("wb") as handle:
            for chunk in response.iter_bytes():
                handle.write(chunk)
    return dest
