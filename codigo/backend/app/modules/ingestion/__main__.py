"""CLI entry point: `python -m app.modules.ingestion <command> [--file PATH ...]`.

Commands: homicidios, desaparecidas, detenidos, all (runs the three in
order), cantons, population, extorsion, siniestros. Without --file,
homicidios/desaparecidas/detenidos fetch the current CKAN resources for the
dataset, download any missing ones into /data/raw/mdi/ and load each;
cantons/population/extorsion/siniestros always take an explicit --file (none
of them have a CKAN package of their own). --force reprocesses a file even if
it was already loaded -- safe for homicidios/desaparecidas/detenidos/cantons/
population since ON CONFLICT DO NOTHING/DO UPDATE still lands on the exact
same rows (see `app.modules.ingestion.loader.load_file`), and safe for
extorsion/siniestros since each file's aggregate fully replaces (never adds
to) the one from its own last run (see
`app.modules.ingestion.canton_indicators.load_indicator_file`).

`siniestros` takes one `--file` per source year chosen per the INEC ESTRA
ingestion plan (an annual file when one exists, else the year's quarterlies;
see `app.modules.ingestion.adapters.inec_siniestros`'s docstring) -- pass it
multiple times, or invoke the command once per file.
"""

import argparse
import json
import logging
from pathlib import Path

from sqlalchemy.orm import Session

from app.database.session import get_engine
from app.modules.ingestion.adapters import inec_siniestros, oeco_extorsion
from app.modules.ingestion.adapters.mdi_desaparecidas import (
    normalize_row as normalize_desaparecidas,
)
from app.modules.ingestion.adapters.mdi_detenidos import normalize_row as normalize_detenidos
from app.modules.ingestion.adapters.mdi_homicidios import normalize_row as normalize_homicidios
from app.modules.ingestion.canton_indicators import load_indicator_file
from app.modules.ingestion.ckan import (
    DESAPARECIDAS_PACKAGE_ID,
    DETENIDOS_PACKAGE_ID,
    HOMICIDIOS_PACKAGE_ID,
    download,
    package_resources,
    select_per_record_resources,
)
from app.modules.ingestion.loader import DETENTION_TARGET, INCIDENT_TARGET, LoadTarget, load_file
from app.modules.ingestion.territory import load_cantons, load_population, validate_coverage

logger = logging.getLogger(__name__)

DEFAULT_RAW_DIR = Path("/data/raw/mdi")

HOMICIDIOS_SOURCE_SLUG = "mdi-homicidios"
DESAPARECIDAS_SOURCE_SLUG = "mdi-desaparecidas"
DETENIDOS_SOURCE_SLUG = "mdi-detenidos"
OECO_SOURCE_SLUG = "oeco-noticias-delito"
INEC_SOURCE_SLUG = "inec-estra"


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


def _print_coverage(session: Session) -> None:
    report = validate_coverage(session)
    if report.clean:
        print(
            "coverage: every canton_code in incidents/detentions has a canton and full population"
        )
        return
    if report.missing_canton:
        print(f"coverage: canton_code with no cantons row: {', '.join(report.missing_canton)}")
    for code, years in report.missing_population_years.items():
        print(f"coverage: {code} missing population for years: {', '.join(map(str, years))}")


def _run(
    source_slug: str,
    files: list[Path],
    normalize,
    target: LoadTarget = INCIDENT_TARGET,
    *,
    force: bool = False,
) -> None:
    with Session(get_engine()) as session:
        for path in files:
            run = load_file(session, source_slug, path, normalize, target, force=force)
            _print_summary(path, run)


def run_homicidios(files: list[Path] | None, *, force: bool = False) -> None:
    """Load intentional-homicide records (from CKAN unless `files` is given).

    Public (no leading underscore) so it can be imported and run on its own
    -- e.g. by `app.workers.historical_worker`, which runs this, run_desaparecidas
    and run_detenidos each in their own try/except and DB session.
    """
    _run(
        HOMICIDIOS_SOURCE_SLUG,
        files or _download(HOMICIDIOS_PACKAGE_ID, DEFAULT_RAW_DIR),
        normalize_homicidios,
        force=force,
    )


def run_desaparecidas(files: list[Path] | None, *, force: bool = False) -> None:
    """Load missing-person records (from CKAN unless `files` is given). See run_homicidios."""
    _run(
        DESAPARECIDAS_SOURCE_SLUG,
        files or _download(DESAPARECIDAS_PACKAGE_ID, DEFAULT_RAW_DIR),
        normalize_desaparecidas,
        force=force,
    )


def run_detenidos(files: list[Path] | None, *, force: bool = False) -> None:
    """Load detention/apprehension records (from CKAN unless `files` is given).

    See run_homicidios.
    """
    _run(
        DETENIDOS_SOURCE_SLUG,
        files or _download(DETENIDOS_PACKAGE_ID, DEFAULT_RAW_DIR),
        normalize_detenidos,
        DETENTION_TARGET,
        force=force,
    )


def _run_cantons(files: list[Path]) -> None:
    with Session(get_engine()) as session:
        for path in files:
            summary = load_cantons(session, path)
            session.commit()
            print(
                f"{path.name}: matched={summary.matched} unmatched={len(summary.unmatched_shapes)}"
            )
            for name in summary.unmatched_shapes:
                print(f"  unmatched shape (no admin_units canton by that name): {name}")
            _print_coverage(session)


def _run_population(files: list[Path]) -> None:
    with Session(get_engine()) as session:
        for path in files:
            summary = load_population(session, path)
            session.commit()
            print(
                f"{path.name}: rows={summary.rows} "
                f"unmatched_provinces={len(summary.unmatched_provinces)} "
                f"unmatched_cantons={len(summary.unmatched_cantons)}"
            )
            for name in summary.unmatched_provinces:
                print(f"  unmatched province sheet: {name}")
            for name in summary.unmatched_cantons:
                print(f"  unmatched canton row: {name}")
            _print_coverage(session)


def _print_indicator_summary(path: Path, run) -> None:
    detail = json.loads(run.error_detail) if run.error_detail else {}
    unmatched = detail.get("unmatched", [])
    skipped = detail.get("skipped", {})
    print(
        f"{path.name}: processed={run.processed} rows_written={run.inserted} "
        f"unmatched={len(unmatched)} skipped={sum(skipped.values())} "
        f"skipped_detail={json.dumps(skipped, ensure_ascii=False)}"
    )
    for line in unmatched:
        print(f"  unmatched: {line}")


def _run_extorsion(files: list[Path], *, force: bool = False) -> None:
    with Session(get_engine()) as session:
        for path in files:
            run = load_indicator_file(
                session, OECO_SOURCE_SLUG, path, oeco_extorsion.parse, force=force
            )
            _print_indicator_summary(path, run)


def _run_siniestros(files: list[Path], *, force: bool = False) -> None:
    with Session(get_engine()) as session:
        for path in files:
            run = load_indicator_file(
                session, INEC_SOURCE_SLUG, path, inec_siniestros.parse, force=force
            )
            _print_indicator_summary(path, run)


def main(argv: list[str] | None = None) -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    parser = argparse.ArgumentParser(prog="python -m app.modules.ingestion")
    subparsers = parser.add_subparsers(dest="command", required=True)

    def _add_file_option(subparser: argparse.ArgumentParser, *, required: bool = False) -> None:
        subparser.add_argument(
            "--file",
            action="append",
            type=Path,
            dest="files",
            required=required,
            help="Load this file instead of fetching the current CKAN resources",
        )

    def _add_force_option(subparser: argparse.ArgumentParser) -> None:
        subparser.add_argument(
            "--force",
            action="store_true",
            help="Reprocess a file even if it was already loaded (safe: still idempotent)",
        )

    homicidios = subparsers.add_parser(
        "homicidios", help="Load intentional-homicide records (homicidio/sicariato/femicidio)"
    )
    _add_file_option(homicidios)
    _add_force_option(homicidios)

    desaparecidas = subparsers.add_parser(
        "desaparecidas", help="Load missing-person records (type=desaparecida)"
    )
    _add_file_option(desaparecidas)
    _add_force_option(desaparecidas)

    detenidos = subparsers.add_parser(
        "detenidos", help="Load detention/apprehension records (detenido/aprehendido)"
    )
    _add_file_option(detenidos)
    _add_force_option(detenidos)

    subparsers.add_parser(
        "all", help="Load homicidios, desaparecidas and detenidos, in that order (from CKAN)"
    )

    cantons = subparsers.add_parser(
        "cantons", help="Load canton boundaries (matched to admin_units by name; see territory.py)"
    )
    _add_file_option(cantons, required=True)

    population = subparsers.add_parser(
        "population", help="Load the INEC cantonal population projection"
    )
    _add_file_option(population, required=True)

    extorsion = subparsers.add_parser(
        "extorsion",
        help="Load OECO extortion (and secuestro extorsivo) counts into canton_indicators",
    )
    _add_file_option(extorsion, required=True)
    _add_force_option(extorsion)

    siniestros = subparsers.add_parser(
        "siniestros",
        help=(
            "Load INEC ESTRA traffic-crash counts into canton_indicators "
            "(one --file per source year, repeatable)"
        ),
    )
    _add_file_option(siniestros, required=True)
    _add_force_option(siniestros)

    args = parser.parse_args(argv)

    if args.command == "homicidios":
        run_homicidios(args.files, force=args.force)
    elif args.command == "desaparecidas":
        run_desaparecidas(args.files, force=args.force)
    elif args.command == "detenidos":
        run_detenidos(args.files, force=args.force)
    elif args.command == "all":
        run_homicidios(None)
        run_desaparecidas(None)
        run_detenidos(None)
    elif args.command == "cantons":
        _run_cantons(args.files)
    elif args.command == "population":
        _run_population(args.files)
    elif args.command == "extorsion":
        _run_extorsion(args.files, force=args.force)
    elif args.command == "siniestros":
        _run_siniestros(args.files, force=args.force)


if __name__ == "__main__":
    main()
