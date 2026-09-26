"""CLI entry point: `python -m app.modules.ingestion <command> [--file PATH ...]`.

Commands: homicidios, desaparecidas, detenidos, all (runs the three in
order). Without --file, fetches the current CKAN resources for the dataset,
downloads any missing ones into /data/raw/mdi/ and loads each. With --file,
loads exactly the given (already-downloaded) files instead.
"""

import argparse
import json
import logging
from pathlib import Path

from sqlalchemy.orm import Session

from app.database.session import get_engine
from app.modules.ingestion.adapters.mdi_desaparecidas import (
    normalize_row as normalize_desaparecidas,
)
from app.modules.ingestion.adapters.mdi_detenidos import normalize_row as normalize_detenidos
from app.modules.ingestion.adapters.mdi_homicidios import normalize_row as normalize_homicidios
from app.modules.ingestion.ckan import (
    DESAPARECIDAS_PACKAGE_ID,
    DETENIDOS_PACKAGE_ID,
    HOMICIDIOS_PACKAGE_ID,
    download,
    package_resources,
    select_per_record_resources,
)
from app.modules.ingestion.loader import DETENTION_TARGET, INCIDENT_TARGET, LoadTarget, load_file

logger = logging.getLogger(__name__)

DEFAULT_RAW_DIR = Path("/data/raw/mdi")

HOMICIDIOS_SOURCE_SLUG = "mdi-homicidios"
DESAPARECIDAS_SOURCE_SLUG = "mdi-desaparecidas"
DETENIDOS_SOURCE_SLUG = "mdi-detenidos"


def _download(package_id: str, dest_dir: Path) -> list[Path]:
    resources = select_per_record_resources(package_resources(package_id))
    return [download(resource, dest_dir) for resource in resources]


def _print_summary(path: Path, run) -> None:
    detail = json.loads(run.error_detail) if run.error_detail else {}
    skipped_total = sum(detail.get("skipped", {}).values())
    print(
        f"{path.name}: processed={run.processed} inserted={run.inserted} "
        f"duplicates={run.duplicates} errors={run.errors} skipped={skipped_total} "
        f"detail={json.dumps(detail, ensure_ascii=False)}"
    )


def _run(
    source_slug: str,
    files: list[Path],
    normalize,
    target: LoadTarget = INCIDENT_TARGET,
) -> None:
    with Session(get_engine()) as session:
        for path in files:
            run = load_file(session, source_slug, path, normalize, target)
            _print_summary(path, run)


def _run_homicidios(files: list[Path] | None) -> None:
    _run(
        HOMICIDIOS_SOURCE_SLUG,
        files or _download(HOMICIDIOS_PACKAGE_ID, DEFAULT_RAW_DIR),
        normalize_homicidios,
    )


def _run_desaparecidas(files: list[Path] | None) -> None:
    _run(
        DESAPARECIDAS_SOURCE_SLUG,
        files or _download(DESAPARECIDAS_PACKAGE_ID, DEFAULT_RAW_DIR),
        normalize_desaparecidas,
    )


def _run_detenidos(files: list[Path] | None) -> None:
    _run(
        DETENIDOS_SOURCE_SLUG,
        files or _download(DETENIDOS_PACKAGE_ID, DEFAULT_RAW_DIR),
        normalize_detenidos,
        DETENTION_TARGET,
    )


def main(argv: list[str] | None = None) -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    parser = argparse.ArgumentParser(prog="python -m app.modules.ingestion")
    subparsers = parser.add_subparsers(dest="command", required=True)

    def _add_file_option(subparser: argparse.ArgumentParser) -> None:
        subparser.add_argument(
            "--file",
            action="append",
            type=Path,
            dest="files",
            help="Load this file instead of fetching the current CKAN resources",
        )

    homicidios = subparsers.add_parser(
        "homicidios", help="Load intentional-homicide records (homicidio/sicariato/femicidio)"
    )
    _add_file_option(homicidios)

    desaparecidas = subparsers.add_parser(
        "desaparecidas", help="Load missing-person records (type=desaparecida)"
    )
    _add_file_option(desaparecidas)

    detenidos = subparsers.add_parser(
        "detenidos", help="Load detention/apprehension records (detenido/aprehendido)"
    )
    _add_file_option(detenidos)

    subparsers.add_parser(
        "all", help="Load homicidios, desaparecidas and detenidos, in that order (from CKAN)"
    )

    args = parser.parse_args(argv)

    if args.command == "homicidios":
        _run_homicidios(args.files)
    elif args.command == "desaparecidas":
        _run_desaparecidas(args.files)
    elif args.command == "detenidos":
        _run_detenidos(args.files)
    elif args.command == "all":
        _run_homicidios(None)
        _run_desaparecidas(None)
        _run_detenidos(None)


if __name__ == "__main__":
    main()
