"""The download-only command and --offline loading used by the data refresh script."""

from pathlib import Path

from app.modules.ingestion import __main__ as cli


def _touch(directory: Path, *names: str) -> None:
    for name in names:
        (directory / name).write_bytes(b"")


def test_local_files_picks_one_source_oldest_period_first(tmp_path: Path):
    _touch(
        tmp_path,
        "mdi_homicidiosintencionales_pm_2026_enero_agosto.xlsx",
        "mdi_homicidiosintencionales_pm_2014_2025.xlsx",
        "mdi_homicidios_intencionales_dd_2025.xlsx",
        "mdi_personasdesaparecidas_pm_2017_2025.xlsx",
    )

    files = cli.local_files(cli.HOMICIDIOS_SOURCE_SLUG, tmp_path)

    assert [path.name for path in files] == [
        "mdi_homicidiosintencionales_pm_2014_2025.xlsx",
        "mdi_homicidiosintencionales_pm_2026_enero_agosto.xlsx",
    ]


def test_offline_never_calls_ckan(tmp_path: Path, monkeypatch):
    _touch(tmp_path, "mdi_detenidosaprehendidos_pm_2026_enero_agosto.xlsx")
    monkeypatch.setattr(cli, "DEFAULT_RAW_DIR", tmp_path)

    def fail(*_args, **_kwargs):
        raise AssertionError("CKAN must not be called with --offline")

    monkeypatch.setattr(cli, "_download", fail)

    files = cli._files(cli.DETENIDOS_SOURCE_SLUG, None, offline=True)

    assert [path.name for path in files] == ["mdi_detenidosaprehendidos_pm_2026_enero_agosto.xlsx"]


def test_download_command_fetches_every_package_into_dest(tmp_path: Path, monkeypatch, capsys):
    requested: list[str] = []

    def fake_download(package_id: str, dest_dir: Path) -> list[Path]:
        requested.append(package_id)
        path = dest_dir / f"{package_id}.xlsx"
        path.write_bytes(b"")
        return [path]

    monkeypatch.setattr(cli, "_download", fake_download)

    cli.main(["download", "--dest", str(tmp_path / "mdi")])

    assert requested == list(cli.CKAN_PACKAGES.values())
    assert capsys.readouterr().out.count(".xlsx") == 3
