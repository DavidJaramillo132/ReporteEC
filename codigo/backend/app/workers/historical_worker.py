"""Daily ingestion worker: re-runs the CKAN-downloadable historical sources.

`python -m app.workers.historical_worker` runs every source once and exits
(handy for a manual check, or a one-shot cron entry). `--loop
--interval-hours 24` keeps running forever instead, sleeping between runs
and stopping cleanly on SIGTERM/SIGINT -- so `docker compose stop` (or a
Kubernetes-style shutdown) never has to kill a run mid-flight.

Each of the three sources below already fetches the current CKAN resources,
downloads only what is missing (see `app.modules.ingestion.ckan.download`'s
same-name-and-size check), and skips a file it already loaded successfully
(see `app.modules.ingestion.loader.load_file`'s file-hash check) -- so a
run where nothing changed upstream is cheap, not a no-op that still
re-downloads everything.

OECO (extorsion) and INEC ESTRA (siniestros) are deliberately NOT part of
this loop:

- OECO has no CKAN package of its own -- each new export must be downloaded
  by hand and registered with
  `python -m app.modules.ingestion extorsion --file <path>`
  (see `app.modules.ingestion.adapters.oeco_extorsion`).
- INEC ESTRA publishes annually (or quarterly before the annual file is
  out), not daily -- load a new file by hand with
  `python -m app.modules.ingestion siniestros --file <path>`
  (see `app.modules.ingestion.adapters.inec_siniestros`).
"""

import argparse
import logging
import signal
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from threading import Event
from types import FrameType

from app.modules.ingestion.__main__ import run_desaparecidas, run_detenidos, run_homicidios

logger = logging.getLogger(__name__)

SourceRunner = Callable[[list[Path] | None], None]

# Order is homicidios/desaparecidas/detenidos, matching the CLI's own "all"
# command. Each runner opens (and closes) its own DB session -- see
# app.modules.ingestion.__main__.run_homicidios and friends -- so one
# source's failure can never leave another source's session in a bad state.
SOURCES: list[tuple[str, SourceRunner]] = [
    ("homicidios", run_homicidios),
    ("desaparecidas", run_desaparecidas),
    ("detenidos", run_detenidos),
]


@dataclass(frozen=True, slots=True)
class SourceOutcome:
    name: str
    ok: bool
    error: str | None = None


@dataclass(frozen=True, slots=True)
class WorkerRunSummary:
    outcomes: list[SourceOutcome] = field(default_factory=list)

    @property
    def succeeded(self) -> list[str]:
        return [outcome.name for outcome in self.outcomes if outcome.ok]

    @property
    def failed(self) -> list[str]:
        return [outcome.name for outcome in self.outcomes if not outcome.ok]


def run_once() -> WorkerRunSummary:
    """Run every source once, in order, each in its own try/except.

    A source that raises is logged and recorded as failed; the remaining
    sources still run. Returns a summary so a caller (the loop below, or a
    test) can see exactly what succeeded and what didn't without parsing logs.
    """
    logger.info("historical worker: run started (%d sources)", len(SOURCES))
    outcomes: list[SourceOutcome] = []
    for name, runner in SOURCES:
        try:
            runner(None)
        except Exception as exc:  # noqa: BLE001 -- one source's failure must never stop the rest
            logger.exception("historical worker: source %s failed", name)
            outcomes.append(SourceOutcome(name=name, ok=False, error=str(exc)))
        else:
            logger.info("historical worker: source %s succeeded", name)
            outcomes.append(SourceOutcome(name=name, ok=True))

    summary = WorkerRunSummary(outcomes)
    logger.info(
        "historical worker: run finished succeeded=%s failed=%s",
        summary.succeeded,
        summary.failed,
    )
    return summary


def run_loop(*, interval_hours: float, stop_event: Event) -> None:
    """Run forever: run_once(), then sleep, until stop_event is set.

    The sleep happens between runs, never inside one, so a stop request
    during the wait exits right away, and one during a run only takes
    effect once that run has finished.
    """
    interval_seconds = interval_hours * 3600
    while not stop_event.is_set():
        run_once()
        if stop_event.wait(timeout=interval_seconds):
            break


def _install_stop_handler(stop_event: Event) -> None:
    def _handle(signum: int, _frame: FrameType | None) -> None:
        logger.info("historical worker: received signal %s, stopping after the current run", signum)
        stop_event.set()

    signal.signal(signal.SIGTERM, _handle)
    signal.signal(signal.SIGINT, _handle)


def main(argv: list[str] | None = None) -> None:
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )
    parser = argparse.ArgumentParser(prog="python -m app.workers.historical_worker")
    parser.add_argument(
        "--loop",
        action="store_true",
        help=(
            "Keep running forever, sleeping --interval-hours between runs "
            "(default: run once and exit)"
        ),
    )
    parser.add_argument(
        "--interval-hours",
        type=float,
        default=24.0,
        help="Hours to sleep between runs in --loop mode (default: 24)",
    )
    args = parser.parse_args(argv)

    if not args.loop:
        run_once()
        return

    stop_event = Event()
    _install_stop_handler(stop_event)
    run_loop(interval_hours=args.interval_hours, stop_event=stop_event)


if __name__ == "__main__":
    main()
