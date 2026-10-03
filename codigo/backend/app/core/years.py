"""Shared parsing of the `years` / `year` query parameters."""

from fastapi import HTTPException


def resolve_years(years: str | None, year: int | None) -> list[int] | None:
    """Selected years from `years` (comma list), falling back to legacy `year`.

    `years` wins when both are given. Returns None when neither selects a year
    (meaning "no year filter"); a malformed `years` is a 422, not a 500.
    """
    if years is not None and years.strip():
        try:
            parsed = sorted({int(part) for part in years.split(",") if part.strip()})
        except ValueError:
            raise HTTPException(
                status_code=422, detail="`years` must be comma-separated integers"
            ) from None
        if parsed:
            return parsed
    return [year] if year is not None else None
