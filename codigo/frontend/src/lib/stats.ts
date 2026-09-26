/**
 * Pure helpers for the Estadísticas page (see components/Estadisticas.tsx):
 * rate formatting, table sorting and the hand-built line chart's scale/path
 * math. Kept apart from any component so they can be unit-tested without a
 * DOM (see stats.test.ts).
 */

import type { StatsRow, TimeseriesPoint } from './api'

const rateFormat = new Intl.NumberFormat('es-EC', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

/** "12,3" for a real rate, or an em dash when there is no population to divide by. */
export function formatRate(rate: number | null): string {
  return rate === null ? '—' : rateFormat.format(rate)
}

export type StatsSortColumn = 'label' | 'count' | 'population' | 'rate_per_100k'
export type SortDirection = 'asc' | 'desc'

/**
 * A new array, sorted by `column`. A row with no rate (`rate_per_100k: null`,
 * meaning no population figure to divide by) always sorts after every row
 * that does have one, regardless of direction -- "unknown" is never
 * confused with "zero" at either end of the table.
 */
export function sortStatsRows(
  rows: StatsRow[],
  column: StatsSortColumn,
  direction: SortDirection = 'desc',
): StatsRow[] {
  const sign = direction === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    if (column === 'label') return sign * a.label.localeCompare(b.label, 'es')
    const left = a[column]
    const right = b[column]
    if (left === null && right === null) return 0
    if (left === null) return 1
    if (right === null) return -1
    return sign * (left - right)
  })
}

/**
 * The top `limit` rows by rate (ties broken by count, then descending
 * always -- a ranking has one natural direction). Rows with no rate never
 * appear: an unranked place is not the same as the country's least risky.
 */
export function rankByRate(rows: StatsRow[], limit = 15): StatsRow[] {
  return rows
    .filter((row): row is StatsRow & { rate_per_100k: number } => row.rate_per_100k !== null)
    .sort((a, b) => b.rate_per_100k - a.rate_per_100k || b.count - a.count)
    .slice(0, limit)
}

// ---- monthly time series ----------------------------------------------------

export interface MonthlyPoint {
  month: number
  count: number
}

/**
 * `points` (one entry per (year, month) the API returned) reduced to exactly
 * the months in the selected period, IN ORDER, each defaulting to 0 when the
 * API returned nothing for it.
 *
 * Deliberately drops any month outside `months`: the API's own
 * `/api/stats/timeseries` already scopes its rows to the requested filters,
 * but a chart built from a wider or differently-ordered array (e.g. every
 * calendar month, including ones after the data's own cutoff) plots a
 * misleading cliff to a zero baseline for months the reader never asked to
 * see -- indistinguishable at a glance from a real drop in the selected
 * period. Keeping the chart's x-axis limited to `months` is what prevents
 * that, not a different scale or path algorithm.
 */
export function buildMonthlySeries(points: TimeseriesPoint[], months: number[]): MonthlyPoint[] {
  const countByMonth = new Map(points.map((point) => [point.month, point.count]))
  return [...months].sort((a, b) => a - b).map((month) => ({ month, count: countByMonth.get(month) ?? 0 }))
}

// ---- chart scale/path building ---------------------------------------------

/** A linear scale from `domain` to `range`, the same shape as d3's. */
export function linearScale(domain: [number, number], range: [number, number]) {
  const [d0, d1] = domain
  const [r0, r1] = range
  const span = d1 - d0
  return (value: number) => (span === 0 ? r0 : r0 + ((value - d0) / span) * (r1 - r0))
}

export interface ChartPoint {
  x: number
  y: number
}

/** An SVG `<path>` `d` attribute connecting every point with a straight line. */
export function buildLinePath(points: ChartPoint[]): string {
  if (points.length === 0) return ''
  return points.map((point, i) => `${i === 0 ? 'M' : 'L'} ${round(point.x)} ${round(point.y)}`).join(' ')
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
