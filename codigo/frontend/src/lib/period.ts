/**
 * The data cut (e.g. 2026-08-31) only limits its own year: earlier years are
 * complete and publish all twelve months. `periodTo` is meta.period.to
 * (YYYY-MM-DD, Ecuador time).
 */
export function lastPublishedMonth(year: number, periodTo: string | null | undefined): number {
  if (!periodTo) return 12
  const cutYear = Number(periodTo.slice(0, 4))
  const cutMonth = Number(periodTo.slice(5, 7))
  if (year < cutYear) return 12
  if (year === cutYear) return cutMonth
  return 0
}

/**
 * Months to keep when the reader switches year. A full selection stays full
 * (so 2026 enero–agosto becomes 2025 enero–diciembre); a partial one keeps
 * the months the new year has, falling back to all of them if none remain.
 */
export function monthsForYear(months: number[], previousLast: number, nextLast: number): number[] {
  const all = Array.from({ length: nextLast }, (_, i) => i + 1)
  const wasFull = months.length === previousLast && months.every((m) => m <= previousLast)
  if (wasFull) return all
  const kept = months.filter((m) => m <= nextLast)
  return kept.length > 0 ? kept : all
}
