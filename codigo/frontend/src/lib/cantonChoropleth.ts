/**
 * Pure helpers for the canton-level choropleth layer (extortion / traffic
 * crashes; see components/IncidentMap.tsx for the MapLibre feature-state and
 * paint-expression wiring, components/MapLegend.tsx for the swatches, and
 * components/Estadisticas.tsx for the ranking/year-total tables).
 *
 * Color values here mirror the `--color-canton-*` custom properties in
 * index.css -- the same JS+CSS duplication already used for TYPE_COLOR next
 * to `--color-homicidio` etc. in this file's sibling, registry.ts.
 */

import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec'
import type {
  CantonIndicator,
  CantonIndicatorClass,
  CantonIndicatorRow,
  CantonIndicatorYearTotal,
  StatsRow,
} from './api'
import type { CantonLayer } from './registry'
import { formatRate } from './stats'
import { placeName } from './registry'

/** The two indicator-bearing values of `CantonLayer` (excludes 'none'). */
export type ActiveCantonLayer = Exclude<CantonLayer, 'none'>

/** Feature-state cannot hold `null`; this sentinel stands in for `class: null` (value > 0 but no population figure for that year). */
export const NO_DATA_CLASS = 'sin_datos'

export type CantonFeatureClass = Exclude<CantonIndicatorClass, null> | typeof NO_DATA_CLASS

export function encodeClass(cls: CantonIndicatorClass): CantonFeatureClass {
  return cls ?? NO_DATA_CLASS
}

/**
 * Extortion ramp: a single new warm-red hue family, scoped to this layer only
 * (never mixed into the general `sello` interface accent) -- see DESIGN.md's
 * Two-Hue Rule. Stepped by lightness/saturation, anchored near
 * `--color-homicidio` (#b23b2a), not a literal green-to-red semáforo.
 */
export const EXTORSION_COLOR: Record<CantonFeatureClass, string> = {
  sin_denuncias: '#edf0ee',
  sin_registros: '#edf0ee', // unused for this indicator; kept for type completeness
  bajo: '#e3cba3',
  moderado: '#c98a5c',
  alto: '#a04a34',
  critico: '#6e1f14',
  sin_datos: '#9aa3ab',
}

/** Traffic-crash ramp: sequential single hue, reusing the existing `--color-sello` accent. */
export const SINIESTROS_COLOR: Record<CantonFeatureClass, string> = {
  sin_registros: '#edf0ee',
  sin_denuncias: '#edf0ee', // unused for this indicator; kept for type completeness
  bajo: '#c3d3e0',
  moderado: '#7fa1bf',
  alto: '#3e6f98',
  critico: '#1d4a73',
  sin_datos: '#9aa3ab',
}

/**
 * Non-color cue required alongside the new hue (DESIGN.md: "reinforce ...
 * with shape as well as hue"): fill opacity climbs with severity, so the
 * ramp is still distinguishable with hue stripped out (colorblind safety).
 */
export const CLASS_OPACITY: Record<CantonFeatureClass, number> = {
  sin_denuncias: 0.25,
  sin_registros: 0.25,
  bajo: 0.4,
  moderado: 0.55,
  alto: 0.7,
  critico: 0.85,
  sin_datos: 0.5,
}

const PALETTE: Record<ActiveCantonLayer, Record<CantonFeatureClass, string>> = {
  extorsion: EXTORSION_COLOR,
  siniestros: SINIESTROS_COLOR,
}

export function colorForClass(layer: ActiveCantonLayer, cls: CantonIndicatorClass): string {
  return PALETTE[layer][encodeClass(cls)]
}

export interface CantonFeatureStateEntry {
  code: string
  state: { value: number; class: CantonFeatureClass; rate: number }
}

/**
 * Rows -> the exact entries to pass to `map.setFeatureState`, one per
 * canton. `rate: -1` is the sentinel for a null rate (no population that
 * year), so it is never confused with a real rate of 0.
 */
export function buildFeatureStateEntries(rows: CantonIndicatorRow[]): CantonFeatureStateEntry[] {
  return rows.map((row) => ({
    code: row.code,
    state: { value: row.value, class: encodeClass(row.class), rate: row.rate_per_100k ?? -1 },
  }))
}

const CLASS_ORDER: CantonFeatureClass[] = [
  'sin_denuncias',
  'sin_registros',
  'bajo',
  'moderado',
  'alto',
  'critico',
  'sin_datos',
]

/** The `fill-color` paint expression for the active layer, keyed on `['feature-state', 'class']`. */
export function buildFillColorExpression(layer: ActiveCantonLayer): ExpressionSpecification {
  const colors = PALETTE[layer]
  const cases = CLASS_ORDER.flatMap((cls) => [cls, colors[cls]])
  return ['match', ['feature-state', 'class'], ...cases, colors.sin_datos] as ExpressionSpecification
}

/**
 * The `fill-opacity` paint expression, shared by both layers. Defaults to 0
 * (not `sin_datos`'s 0.5) for a feature with no state yet, so the choropleth
 * never flashes a false reading across all 221 cantons before the first
 * fetch resolves.
 */
export function buildFillOpacityExpression(): ExpressionSpecification {
  const cases = CLASS_ORDER.flatMap((cls) => [cls, CLASS_OPACITY[cls]])
  return ['match', ['feature-state', 'class'], ...cases, 0] as ExpressionSpecification
}

export interface YearAvailability {
  hasData: boolean
  latestYear: number | null
}

/** Whether `year` has real data for this indicator, and the year to offer jumping to when it does not. */
export function checkYearAvailability(availableYears: number[], year: number): YearAvailability {
  return {
    hasData: availableYears.includes(year),
    latestYear: availableYears.length ? Math.max(...availableYears) : null,
  }
}

export const CANTON_INDICATOR_LABEL: Record<ActiveCantonLayer, string> = {
  extorsion: 'extorsión',
  siniestros: 'siniestros de tránsito',
}

export function noDataMessage(layer: ActiveCantonLayer, year: number): string {
  return `Sin datos de ${CANTON_INDICATOR_LABEL[layer]} para ${year}.`
}

/**
 * Maps the frontend's `CantonLayer` value to the backend `indicator` query
 * param -- currently identical, kept as its own function so a future split
 * (e.g. a separate fallecidos toggle) only changes one place.
 */
export function indicatorForLayer(layer: ActiveCantonLayer): CantonIndicator {
  return layer
}

const CANTON_SOURCE_LABEL: Record<ActiveCantonLayer, string> = {
  extorsion: 'OECO/FGE',
  siniestros: 'INEC',
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      default:
        return '&#39;'
    }
  })
}

/** Spanish label for a canton's quartile class, matching MapLegend.tsx's swatch wording exactly. `null` means value > 0 but no population figure for that year (not a quartile). */
export const CANTON_CLASS_LABEL: Record<Exclude<CantonIndicatorClass, null>, string> & { null: string } = {
  bajo: 'Bajo',
  moderado: 'Moderado',
  alto: 'Alto',
  critico: 'Crítico',
  sin_denuncias: 'Sin denuncias',
  sin_registros: 'Sin registros',
  null: 'Sin datos de población',
}

/** The canton click popup's content, as a plain HTML string (see IncidentMap.tsx's `cantons-fill` click handler). */
export function buildCantonPopupHtml(layer: ActiveCantonLayer, row: CantonIndicatorRow, year: number): string {
  const rate =
    row.rate_per_100k === null ? 'Sin datos de población' : `${formatRate(row.rate_per_100k)} por 100.000 hab.`
  const classLabel = CANTON_CLASS_LABEL[row.class ?? 'null']
  return (
    `<div class="text-[13px] text-ink-2">` +
    `<p class="font-semibold text-ink">${escapeHtml(placeName(row.name))}</p>` +
    `<dl class="mt-1 space-y-0.5">` +
    `<div class="flex justify-between gap-3"><dt>${CANTON_INDICATOR_LABEL[layer]}, ${year}</dt><dd class="tabular-nums text-ink">${row.value}</dd></div>` +
    `<div class="flex justify-between gap-3"><dt>Tasa</dt><dd class="tabular-nums">${rate}</dd></div>` +
    `<div class="flex justify-between gap-3"><dt>Categoría</dt><dd>${classLabel}</dd></div>` +
    `<div class="flex justify-between gap-3"><dt>Fuente</dt><dd>${CANTON_SOURCE_LABEL[layer]}</dd></div>` +
    `</dl></div>`
  )
}

/** `CantonIndicatorYearTotal[]` (the summary endpoint) reshaped into the generic `StatsRow` table shape, so `RateTable`/`sortStatsRows`/`rankByRate` work unchanged. */
export function yearTotalsToStatsRows(years: CantonIndicatorYearTotal[]): StatsRow[] {
  return years.map((y) => ({
    key: String(y.year),
    label: String(y.year),
    count: y.value,
    population: y.population ?? 0,
    rate_per_100k: y.rate_per_100k,
    low_population_warning: y.population !== null && y.population < 10000,
  }))
}

/** `CantonIndicatorRow[]` (the per-year endpoint) reshaped the same way, for the "top cantones por tasa" ranking table. */
export function indicatorRowsToStatsRows(rows: CantonIndicatorRow[]): StatsRow[] {
  return rows.map((row) => ({
    key: row.code,
    label: row.name,
    count: row.value,
    population: row.population ?? 0,
    rate_per_100k: row.rate_per_100k,
    low_population_warning: row.population !== null && row.population < 10000,
  }))
}
