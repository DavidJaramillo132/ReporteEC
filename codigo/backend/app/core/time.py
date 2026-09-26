"""Shared local-time constant.

Every "year", "month" or "date" shown to a person -- in the database views,
the API, and the ingestion adapters -- is computed in this timezone, never
UTC: Ecuador has no daylight saving time, but UTC alone still shifts a New
Year's Eve incident into the wrong year.
"""

from zoneinfo import ZoneInfo

GUAYAQUIL = ZoneInfo("America/Guayaquil")
