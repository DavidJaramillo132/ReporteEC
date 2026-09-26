"""CLI entry point: `python -m app.modules.ingestion homicidios [--file PATH ...]`.

Without --file, fetches the current CKAN resources for the dataset,
downloads any missing ones into /data/raw/mdi/ and loads each. With --file,
loads exactly the given (already-downloaded) files instead.
"""

import argparse
import json
import logging
from pathlib import Path

from sqlalchemy.orm import Session

from app.database.session import get_engine
from app.modules.ingestion.adapters.mdi_homicidios import normalize_row
from app.modules.ingestion.ckan import (
    HOMICIDIOS_PACKAGE_ID,
    download,
    package_resources,
    select_homicide_resources,
)
from app.modules.ingestion.loader import load_file

logger = logging.getLogger(__name__)

DEFAULT_RAW_DIR = Path("/data/raw/mdi")
HOMICIDIOS_SOURCE_SLUG = "mdi-homicidios"


def _download_homicidios(dest_dir: Path) -> list[Path]:
    resources = select_homicide_resources(package_resources(HOMICIDIOS_PACKAGE_ID))
    return [download(resource, dest_dir) for resource in resources]


def _print_summary(path: Path, run) -> None:
    detail = json.loads(run.error_detail) if run.error_detail else {}
    skipped_total = sum(detail.get("skipped", {}).values())
    print(
        f"{path.name}: processed={run.processed} inserted={run.inserted} "
        f"duplicates={run.duplicates} errors={run.errors} skipped={skipped_total} "
        f"detail={json.dumps(detail, ensure_ascii=False)}"
    )


def _run_homicidios(files: list[Path]) -> None:
    with Session(get_engine()) as session:
        for path in files:
            run = load_file(session, HOMICIDIOS_SOURCE_SLUG, path, normalize_row)
            _print_summary(path, run)


def main(argv: list[str] | None = None) -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    parser = argparse.ArgumentParser(prog="python -m app.modules.ingestion")
    subparsers = parser.add_subparsers(dest="command", required=True)

    homicidios = subparsers.add_parser(
        "homicidios", help="Load intentional-homicide records (homicidio/sicariato/femicidio)"
    )
    homicidios.add_argument(
        "--file",
        action="append",
        type=Path,
        dest="files",
        help="Load this file instead of fetching the current CKAN resources",
    )

    args = parser.parse_args(argv)

    if args.command == "homicidios":
        files = args.files if args.files else _download_homicidios(DEFAULT_RAW_DIR)
        _run_homicidios(files)


if __name__ == "__main__":
    main()
