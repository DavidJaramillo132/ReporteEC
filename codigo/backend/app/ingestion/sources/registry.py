"""Registry of known Source rows and an idempotent upsert for them.

Adapters and the CLI reference a source by its stable slug, never by
database id, so the row (and its metadata) must exist before a PipelineRun
can be created against it.
"""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.sources.models import Source


@dataclass(frozen=True, slots=True)
class SourceSeed:
    slug: str
    name: str
    publisher: str
    url: str
    license: str


MDI_HOMICIDIOS = SourceSeed(
    slug="mdi-homicidios",
    name="Homicidios intencionales",
    publisher="Ministerio del Interior",
    url="https://www.datosabiertos.gob.ec/dataset/homicidios-intencionales",
    license="Datos abiertos del Gobierno del Ecuador (datosabiertos.gob.ec)",
)

MDI_DESAPARECIDAS = SourceSeed(
    slug="mdi-desaparecidas",
    name="Personas desaparecidas",
    publisher="Ministerio del Interior",
    url="https://www.datosabiertos.gob.ec/dataset/personas-desaparecidas",
    license="Datos abiertos del Gobierno del Ecuador (datosabiertos.gob.ec)",
)

MDI_DETENIDOS = SourceSeed(
    slug="mdi-detenidos",
    name="Personas detenidas y aprehendidas",
    publisher="Ministerio del Interior",
    url="https://www.datosabiertos.gob.ec/dataset/personas-detenidas-aprehendidas",
    license="Datos abiertos del Gobierno del Ecuador (datosabiertos.gob.ec)",
)

OECO_NOTICIAS_DELITO = SourceSeed(
    slug="oeco-noticias-delito",
    name="Estadística de Noticias de Delito relacionados a Crimen Organizado",
    publisher="Observatorio Ecuatoriano de Crimen Organizado (OECO) / PADF, datos originales FGE",
    url="https://visualizador-oeco.up.railway.app/descargas",
    license="consultar condiciones del OECO",
)

INEC_ESTRA = SourceSeed(
    slug="inec-estra",
    name="Estadísticas de Transporte (ESTRA) - Siniestros de tránsito",
    publisher="Instituto Nacional de Estadística y Censos (INEC)",
    url="https://www.ecuadorencifras.gob.ec/siniestros-transito-trimestral/",
    license="datos públicos INEC",
)

SEEDS: dict[str, SourceSeed] = {
    seed.slug: seed
    for seed in (
        MDI_HOMICIDIOS,
        MDI_DESAPARECIDAS,
        MDI_DETENIDOS,
        OECO_NOTICIAS_DELITO,
        INEC_ESTRA,
    )
}


def ensure_source(session: Session, slug: str) -> Source:
    """Get-or-create (and refresh) the Source row for `slug` from the registry above.

    Refreshing an existing row on every call keeps name/url/license edits to
    the registry in sync with the database without a migration.
    """
    seed = SEEDS.get(slug)
    if seed is None:
        raise KeyError(f"no seed registered for source slug {slug!r}")

    source = session.scalar(select(Source).where(Source.slug == slug))
    if source is None:
        source = Source(
            slug=seed.slug,
            name=seed.name,
            publisher=seed.publisher,
            url=seed.url,
            license=seed.license,
        )
        session.add(source)
    else:
        source.name = seed.name
        source.publisher = seed.publisher
        source.url = seed.url
        source.license = seed.license

    session.flush()
    return source
