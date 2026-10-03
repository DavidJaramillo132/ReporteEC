"""Shared parsing of the `years` / `year` query parameters."""

from fastapi import HTTPException

# Plausible calendar years; anything outside would overflow or match nothing.
MIN_YEAR = 1900
MAX_YEAR = 2100


def check_year(year: int) -> int:
    """The year itself, or a 422 when it is outside MIN_YEAR..MAX_YEAR."""
    if not MIN_YEAR <= year <= MAX_YEAR:
        raise HTTPException(
            status_code=422, detail=f"years must be between {MIN_YEAR} and {MAX_YEAR}"
        )
    return year


def resolve_years(years: str | None, year: int | None) -> list[int] | None:
    """Selected years from `years` (comma list), falling back to legacy `year`.

    `years` wins when both are given. Returns None when neither selects a year
    (meaning "no year filter"); a malformed `years` is a 422, not a 500.
    """
    if years is not None and years.strip():
        try:
            parsed = sorted({check_year(int(part)) for part in years.split(",") if part.strip()})
        except ValueError:
            raise HTTPException(
                status_code=422, detail="`years` must be comma-separated integers"
            ) from None
        if parsed:
            return parsed
    return [check_year(year)] if year is not None else None
