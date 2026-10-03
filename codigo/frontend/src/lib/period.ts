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

/**
 * With several years, a month is selectable when it is published for at least
 * one of them: the max of `lastPublishedMonth` over the selection.
 */
export function lastPublishedMonthForYears(years: number[], periodTo: string | null | undefined): number {
  if (years.length === 0) return 0
  return Math.max(...years.map((y) => lastPublishedMonth(y, periodTo)))
}

/**
 * Toggles a year in or out of the selection (kept sorted). Removing the last
 * remaining year is a no-op: at least one year is always selected.
 */
export function toggleYear(years: number[], year: number): number[] {
  if (!years.includes(year)) return [...years, year].sort((a, b) => a - b)
  return years.length === 1 ? years : years.filter((y) => y !== year)
}

/** The year to compare against: only for a single-year selection (and only if it is not before the first year). */
export function previousYearFor(years: number[], firstYear: number): number | null {
  if (years.length !== 1) return null
  return years[0] - 1 >= firstYear ? years[0] - 1 : null
}

/** True for a sorted list of three or more consecutive integers. */
export function isContiguousRun(values: number[]): boolean {
  return values.length >= 3 && values.every((v, i) => i === 0 || v === values[i - 1] + 1)
}

const MONTH_NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

function joinWithY(parts: string[]): string {
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`
}

/** «2026», «2024 y 2025», «2024–2026» (three or more consecutive), «2019, 2021 y 2023». */
export function formatYears(years: number[]): string {
  const sorted = [...years].sort((a, b) => a - b)
  if (isContiguousRun(sorted)) return `${sorted[0]}–${sorted[sorted.length - 1]}`
  return joinWithY(sorted.map(String))
}

/** «marzo», «enero–agosto» (a run of two or more), «enero, marzo y mayo». */
export function formatMonths(months: number[]): string {
  const sorted = [...months].sort((a, b) => a - b)
  const name = (m: number) => MONTH_NAMES[m - 1]
  const contiguous = sorted.length > 1 && sorted.every((m, i) => i === 0 || m === sorted[i - 1] + 1)
  if (contiguous) return `${name(sorted[0])}–${name(sorted[sorted.length - 1])}`
  return joinWithY(sorted.map(name))
}

/**
 * The period a view covers, in plain Spanish: «enero–agosto 2026» for one
 * year, «2024–2026, enero–diciembre» for several.
 */
export function formatPeriodLabel(years: number[], months: number[]): string {
  if (years.length === 1) return `${formatMonths(months)} ${years[0]}`
  return `${formatYears(years)}, ${formatMonths(months)}`
}
