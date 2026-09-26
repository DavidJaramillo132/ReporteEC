"""Unit tests for the daily worker's orchestration -- no database, no network.

Each source function is monkeypatched directly onto `historical_worker.SOURCES`,
so these tests exercise only run_once's error isolation and run_loop's
stop-event handling, never the real CKAN/loader pipeline (covered by
tests/ingestion/*).
"""

from threading import Event

from app.workers import historical_worker


def _ok(_files: list | None) -> None:
    return None


def _boom(_files: list | None) -> None:
    raise RuntimeError("boom")


def test_run_once_runs_every_source_when_all_succeed(monkeypatch):
    calls: list[str] = []

    def make_ok(name: str):
        def _runner(_files: list | None) -> None:
            calls.append(name)

        return _runner

    monkeypatch.setattr(
        historical_worker,
        "SOURCES",
        [("a", make_ok("a")), ("b", make_ok("b")), ("c", make_ok("c"))],
    )

    summary = historical_worker.run_once()

    assert calls == ["a", "b", "c"]
    assert summary.succeeded == ["a", "b", "c"]
    assert summary.failed == []


def test_run_once_continues_after_one_source_fails(monkeypatch):
    calls: list[str] = []

    def make_ok(name: str):
        def _runner(_files: list | None) -> None:
            calls.append(name)

        return _runner

    monkeypatch.setattr(
        historical_worker,
        "SOURCES",
        [
            ("homicidios", make_ok("homicidios")),
            ("desaparecidas", _boom),
            ("detenidos", make_ok("detenidos")),
        ],
    )

    summary = historical_worker.run_once()

    # The failing source never stops the ones after it.
    assert calls == ["homicidios", "detenidos"]
    assert summary.succeeded == ["homicidios", "detenidos"]
    assert summary.failed == ["desaparecidas"]
    failed_outcome = next(o for o in summary.outcomes if o.name == "desaparecidas")
    assert failed_outcome.error == "boom"


def test_run_once_reports_every_failure(monkeypatch):
    monkeypatch.setattr(historical_worker, "SOURCES", [("a", _boom), ("b", _boom)])

    summary = historical_worker.run_once()

    assert summary.succeeded == []
    assert summary.failed == ["a", "b"]


def test_run_loop_stops_once_stop_event_is_set(monkeypatch):
    calls: list[int] = []
    stop_event = Event()

    def fake_run_once() -> historical_worker.WorkerRunSummary:
        calls.append(1)
        stop_event.set()
        return historical_worker.WorkerRunSummary()

    monkeypatch.setattr(historical_worker, "run_once", fake_run_once)

    historical_worker.run_loop(interval_hours=0.0, stop_event=stop_event)

    # run_once ran exactly once: the loop noticed the stop event during the
    # (zero-length) sleep and exited instead of running again.
    assert calls == [1]


def test_run_loop_never_runs_when_stop_event_is_already_set(monkeypatch):
    calls: list[int] = []
    stop_event = Event()
    stop_event.set()

    def fake_run_once() -> historical_worker.WorkerRunSummary:
        calls.append(1)
        return historical_worker.WorkerRunSummary()

    monkeypatch.setattr(historical_worker, "run_once", fake_run_once)

    historical_worker.run_loop(interval_hours=0.0, stop_event=stop_event)

    assert calls == []
