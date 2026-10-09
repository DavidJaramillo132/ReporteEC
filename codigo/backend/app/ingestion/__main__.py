"""CLI entry point: `python -m app.ingestion <command> [--file PATH ...]`.

Commands: homicidios, desaparecidas, detenidos, all (runs the three in
order), download (CKAN files only, no database), cantons, population,
extorsion, siniestros, route-reference (the exposure distribution behind the
route risk 0-100 score; needs OSRM, see app.modules.routing.reference).
--offline loads the MDI files already on disk instead of fetching CKAN, which blocks
the production VPS. Without --file,
homicidios/desaparecidas/detenidos fetch the current CKAN resources for the
dataset, download any missing ones into /data/raw/mdi/ and load each;
cantons/population/extorsion/siniestros always take an explicit --file (none
of them have a CKAN package of their own). --force reprocesses a file even if
it was already loaded -- safe for homicidios/desaparecidas/detenidos/cantons/
population since ON CONFLICT DO NOTHING/DO UPDATE still lands on the exact
same rows (see `app.ingestion.loaders.incidents.load_file`), and safe for
extorsion/siniestros since each file's aggregate fully replaces (never adds
to) the one from its own last run (see
`app.ingestion.loaders.indicators.load_indicator_file`).

`siniestros` takes one `--file` per source year chosen per the INEC ESTRA
ingestion plan (an annual file when one exists, else the year's quarterlies;
see `app.ingestion.adapters.inec_siniestros`'s docstring) -- pass it
multiple times, or invoke the command once per file.
"""

import argparse
import logging
from pathlib import Path

from app.ingestion.jobs import (
    DEFAULT_RAW_DIR,
    download_all,
    run_cantons,
    run_desaparecidas,
    run_detenidos,
    run_extorsion,
    run_homicidios,
    run_population,
    run_route_reference,
    run_siniestros,
)


def main(argv: list[str] | None = None) -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    parser = argparse.ArgumentParser(prog="python -m app.ingestion")
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

    def _add_offline_option(subparser: argparse.ArgumentParser) -> None:
        subparser.add_argument(
            "--offline",
            action="store_true",
            help="Load the files already in /data/raw/mdi instead of fetching CKAN",
        )

    for subparser in (homicidios, desaparecidas, detenidos):
        _add_offline_option(subparser)

    all_sources = subparsers.add_parser(
        "all", help="Load homicidios, desaparecidas and detenidos, in that order (from CKAN)"
    )
    _add_offline_option(all_sources)

    download_cmd = subparsers.add_parser(
        "download",
        help="Only download the MDI per-record files from CKAN (no database needed)",
    )
    download_cmd.add_argument("--dest", type=Path, default=DEFAULT_RAW_DIR)

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

    subparsers.add_parser(
        "route-reference",
        help="Build the route risk reference distribution (roughly 800-1,000 OSRM calls)",
    )

    args = parser.parse_args(argv)

    if args.command == "homicidios":
        run_homicidios(args.files, force=args.force, offline=args.offline)
    elif args.command == "desaparecidas":
        run_desaparecidas(args.files, force=args.force, offline=args.offline)
    elif args.command == "detenidos":
        run_detenidos(args.files, force=args.force, offline=args.offline)
    elif args.command == "all":
        run_homicidios(None, offline=args.offline)
        run_desaparecidas(None, offline=args.offline)
        run_detenidos(None, offline=args.offline)
    elif args.command == "download":
        for path in download_all(args.dest):
            print(path)
    elif args.command == "cantons":
        run_cantons(args.files)
    elif args.command == "population":
        run_population(args.files)
    elif args.command == "extorsion":
        run_extorsion(args.files, force=args.force)
    elif args.command == "siniestros":
        run_siniestros(args.files, force=args.force)
    elif args.command == "route-reference":
        run_route_reference()


if __name__ == "__main__":
    main()
