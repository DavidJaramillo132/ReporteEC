/**
 * Data shaping for the Estadísticas charts (pages/estadisticas/): API rows in,
 * chart-ready values out, with the count and the rate always travelling
 * together. Pure, so each rule is unit-tested in statsCharts.test.ts.
 */

import type { StatsRow, TimeseriesPoint } from './api'
import { EXTORSION_COLOR, SINIESTROS_COLOR } from './cantonChoropleth'
import { seriesByYear } from './charts'
import { formatMonths, lastPublishedMonth } from './period'
import type { IncidentType } from './registry'
import { INCIDENT_TYPES, TYPE_LABEL, formatCount, placeName } from './registry'
import { formatRate, rankByRate } from './stats'

/** «12,3 por 100.000 hab.», or a plain note when there is no population to divide by. */
export function rateText(rate: number | null): string {
  return rate === null ? 'sin dato de población' : `${formatRate(rate)} por 100.000 hab.`
}

/** A rate for `count` cases over `population` people, or null without a population. */
export function rateFor(count: number, population: number | null | undefined): number | null {
  return population ? (count / population) * 100000 : null
}

/**
 * What ⚠ means. The flag is computed on the population base of the whole
 * period (summed over the selected years), so the text names that base, not
 * the place's population.
 */
export const LOW_POPULATION_TEXT = 'Base de población pequeña en el período (menos de 10.000): la tasa es poco estable'

export interface ChartBar {
  key: string
  label: string
  /** What the bar length encodes. */
  value: number
  /** The direct label at the bar tip: the measure first, the other figure in parentheses. */
  valueLabel: string
  /** The other figure, for the tooltip and the table. */
  detail: string
  /** A population base under 10.000 for the period: the rate is unstable (marked ⚠). */
  lowPopulation?: boolean
}

/**
 * Incident types as bars measured by their count, highest first, limited to
 * the selected `types`. The label reads «9.183 (50,7)»: cases, then the rate.
 */
export function typeBars(rows: StatsRow[], types: IncidentType[]): (ChartBar & { key: IncidentType })[] {
  return rows
    .filter((row): row is StatsRow & { key: IncidentType } => types.includes(row.key as IncidentType))
    .sort((a, b) => b.count - a.count)
    .map((row) => ({
      key: row.key,
      label: TYPE_LABEL[row.key].one,
      value: row.count,
      valueLabel: `${formatCount(row.count)} (${formatRate(row.rate_per_100k)})`,
      detail: rateText(row.rate_per_100k),
    }))
}

/**
 * Places ranked by rate (highest first, at most `limit`), as bars whose length
 * is the rate. The label reads «66,1 (3.456)»: the rate, then the count; a
 * place whose population base for the period is under 10.000 keeps its ⚠. Places without a rate are left
 * out, as in rankByRate.
 */
export function rateBars(rows: StatsRow[], limit = Infinity, unit = 'casos'): ChartBar[] {
  return rankByRate(rows, limit).map((row) => ({
    key: row.key,
    label: placeName(row.label),
    value: row.rate_per_100k,
    valueLabel: `${formatRate(row.rate_per_100k)}${row.low_population_warning ? ' ⚠' : ''} (${formatCount(row.count)})`,
    detail: `${formatCount(row.count)} ${unit}${row.low_population_warning ? ` · ${LOW_POPULATION_TEXT.toLowerCase()}` : ''}`,
    lowPopulation: row.low_population_warning,
  }))
}

export interface YearTotal {
  year: number
  count: number
  rate: number | null
}

/** `dimension=year` rows as year totals, oldest first. */
export function yearTotalsFromRows(rows: StatsRow[]): YearTotal[] {
  return rows
    .map((row) => ({ year: Number(row.key), count: row.count, rate: row.rate_per_100k }))
    .sort((a, b) => a.year - b.year)
}

/**
 * One total per year in `years` (oldest first). A year the response has no
 * row for counts 0 cases, but its rate is unknown (null): that response
 * carries no population for it, and a made-up 0,0 would read as a real rate.
 */
export function yearTotalsFor(rows: StatsRow[], years: number[]): YearTotal[] {
  const totals = yearTotalsFromRows(rows)
  return [...new Set(years)]
    .sort((a, b) => a - b)
    .map((year) => totals.find((t) => t.year === year) ?? { year, count: 0, rate: null })
}

/**
 * Strong (selected years) and muted (other years) colours for the year-trend
 * columns, each pair taken from its section's own ramp (DESIGN.md): the
 * scoped extortion ramp, the `sello` ramp for traffic crashes, and neutral
 * ink greys for detentions. No new hue.
 */
export const TREND_COLORS = {
  extorsion: { strong: EXTORSION_COLOR.critico, muted: EXTORSION_COLOR.moderado },
  siniestros: { strong: SINIESTROS_COLOR.critico, muted: SINIESTROS_COLOR.moderado },
  // ink-3 and --color-ink-faint: neutral greys that never mean "no data".
  detentions: { strong: '#56626e', muted: '#929ba1' },
} as const

export interface TrendColumn {
  key: string
  label: string
  value: number
  detail: string
  color: string
  highlighted: boolean
}

/**
 * One column per year, oldest first. The `highlight` years (the reader's
 * selection) take the strong colour and every other year the muted one, so
 * the selection reads against its context. The rate goes to the tooltip.
 */
export function trendColumns(totals: YearTotal[], highlight: number[], colors: { strong: string; muted: string }): TrendColumn[] {
  return [...totals]
    .sort((a, b) => a.year - b.year)
    .map((total) => {
      const highlighted = highlight.includes(total.year)
      return {
        key: String(total.year),
        label: String(total.year),
        value: total.count,
        detail: rateText(total.rate),
        color: highlighted ? colors.strong : colors.muted,
        highlighted,
      }
    })
}

/** Legend for a highlighted trend: only the kinds of column actually drawn are listed. */
export function trendLegend(columns: TrendColumn[], colors: { strong: string; muted: string }): { key: string; label: string; color: string }[] {
  return [
    ...(columns.some((c) => c.highlighted) ? [{ key: 'elegidos', label: 'Años elegidos', color: colors.strong }] : []),
    ...(columns.some((c) => !c.highlighted) ? [{ key: 'otros', label: 'Otros años', color: colors.muted }] : []),
  ]
}

export interface YearLine {
  year: number
  /** One value per selected month, in order; null where that year has no published month yet. */
  values: (number | null)[]
}

/**
 * The monthly series, one per year (oldest first) over the selected months.
 * A month the source has not published yet for that year (after the data cut)
 * is a gap, never a zero: a fall to zero would read as a real drop.
 */
export function monthlyLinesByYear(
  points: TimeseriesPoint[],
  years: number[],
  months: number[],
  periodTo: string | null | undefined,
): YearLine[] {
  return seriesByYear(points, years, months).map(({ year, values }) => {
    const last = lastPublishedMonth(year, periodTo)
    return { year, values: values.map((point) => (point.month > last ? null : point.count)) }
  })
}

export interface TypeYearGroup {
  key: string
  label: string
  /** One count per type, in `types` order. */
  values: number[]
  /** The matching rates, in the same order. */
  details: string[]
}

/**
 * Counts per (year, type) for the grouped columns: one group per year (oldest
 * first), one value per selected type in the registry's fixed order, so a
 * type keeps its place and ink in every group. A type with no rows that year
 * is a real zero; its rate uses the population the year's other rows share.
 */
export function typesByYear(
  perYear: { year: number; rows: StatsRow[] }[],
  selected: IncidentType[],
): { types: IncidentType[]; groups: TypeYearGroup[] } {
  const types = INCIDENT_TYPES.filter((type) => selected.includes(type))
  const groups = [...perYear]
    .sort((a, b) => a.year - b.year)
    .map(({ year, rows }) => {
      const population = rows[0]?.population ?? null
      const byType = new Map(rows.map((row) => [row.key, row]))
      const values = types.map((type) => byType.get(type)?.count ?? 0)
      const details = types.map((type, i) => rateText(byType.get(type)?.rate_per_100k ?? rateFor(values[i], population)))
      return { key: String(year), label: String(year), values, details }
    })
  return { types, groups }
}

/**
 * A plain note when one of `years` is the cut year and the selected months
 * reach past its last published month, e.g. «2026 llega solo hasta agosto:
 * su total no cubre todos los meses elegidos.» Null when every year is
 * complete for the selection.
 */
export function incompleteYearNote(years: number[], months: number[], periodTo: string | null | undefined): string | null {
  const maxMonth = Math.max(0, ...months)
  const partial = [...years]
    .sort((a, b) => a - b)
    .find((year) => {
      const last = lastPublishedMonth(year, periodTo)
      return last > 0 && last < maxMonth
    })
  if (partial === undefined) return null
  return `${partial} llega solo hasta ${formatMonths([lastPublishedMonth(partial, periodTo)])}: su total no cubre todos los meses elegidos.`
}
