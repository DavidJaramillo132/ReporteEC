/**
 * Pure helpers behind the hand-built SVG charts (components/charts/): tick
 * scales, mark geometry, tooltip placement, the year colour ramp and data
 * shaping. No DOM, so each one is unit-tested in charts.test.ts. Scales and
 * line paths themselves live in stats.ts (linearScale, buildLinePath).
 */

import type { TimeseriesPoint } from './api'
import type { IncidentType } from './registry'
import { TYPE_COLOR, TYPE_LABEL } from './registry'
import type { MonthlyPoint } from './stats'
import { buildMonthlySeries } from './stats'

// ---- colour -----------------------------------------------------------------

/** `sello`, the darkest (newest) end of the year ramp. */
export const SELLO = '#1d4a73'
/**
 * The lightest (oldest) end. Chosen so it still clears 2:1 against the paper
 * surface (#edf0ee), the ordinal-ramp floor of the dataviz validator.
 */
export const SELLO_LIGHT = '#7fa1bf'

function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`
}

/** A colour between `from` and `to` at `t` (0 = from, 1 = to), in sRGB. */
export function mixHex(from: string, to: string, t: number): string {
  const a = hexToRgb(from)
  const b = hexToRgb(to)
  return rgbToHex([0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t) as [number, number, number])
}

/**
 * Years are ordinal, so they take one hue (`sello`) stepped by lightness:
 * oldest lightest, newest darkest. The step depends on a year's rank among
 * `years`, so a single year is plain `sello`. A year outside `years` falls
 * back to `sello` rather than inventing a colour.
 */
export function yearColor(year: number, years: number[]): string {
  const sorted = [...new Set(years)].sort((a, b) => a - b)
  const rank = sorted.indexOf(year)
  if (rank === -1 || sorted.length === 1) return SELLO
  return mixHex(SELLO_LIGHT, SELLO, rank / (sorted.length - 1))
}

// ---- scales -----------------------------------------------------------------

export interface NiceScale {
  /** Upper bound of the axis: the last tick. */
  max: number
  /** 0 and every step up to `max`. */
  ticks: number[]
}

/**
 * A zero-based axis with clean tick values (1, 2 or 5 times a power of ten)
 * that covers `maxValue` in at most `target + 1` steps. An all-zero or empty series
 * still gets a usable 0..1 axis.
 */
export function niceScale(maxValue: number, target = 4): NiceScale {
  if (!(maxValue > 0)) return { max: 1, ticks: [0, 1] }
  // Smallest 1/2/5 x 10^k step that needs at most `target + 1` intervals.
  const base = Math.pow(10, Math.floor(Math.log10(maxValue / (target + 1))))
  const step = [1, 2, 5, 10, 20].map((m) => m * base).find((candidate) => Math.ceil(maxValue / candidate - 1e-9) <= target + 1) ?? base * 20
  const count = Math.ceil(maxValue / step - 1e-9)
  const ticks = Array.from({ length: count + 1 }, (_, i) => i * step)
  return { max: ticks[ticks.length - 1], ticks }
}

/**
 * Left gutter for right-aligned y-axis tick labels: room for the longest
 * label plus air, never below `min`. Keeps «100.000» from being clipped.
 */
export function tickGutter(labels: string[], min = 40, charWidth = 6.8): number {
  return Math.max(min, Math.ceil(Math.max(0, ...labels.map((label) => label.length)) * charWidth + 8))
}

export interface BandLayout {
  /** Distance between the starts of two neighbouring bands. */
  step: number
  /** Thickness of each mark: the band minus air, never above `maxThickness`. */
  thickness: number
  /** Start of band `index` for the mark (centred in its band). */
  start: (index: number) => number
}

/**
 * Evenly splits `length` into `count` bands and centres a mark of at most
 * `maxThickness` in each. Marks never fill their band: what is left is air.
 */
export function bandLayout(count: number, length: number, maxThickness = 24, minGap = 2): BandLayout {
  const step = count > 0 ? length / count : length
  const thickness = Math.max(1, Math.min(maxThickness, step - Math.max(minGap, step * 0.3)))
  return { step, thickness, start: (index) => index * step + (step - thickness) / 2 }
}

export interface GroupedLayout {
  /** Distance between the starts of two neighbouring groups. */
  step: number
  /** Width of each column inside a group. */
  column: number
  /** Width of a whole group (its columns plus the gaps between them). */
  groupWidth: number
  /** Left edge of column `seriesIndex` in group `groupIndex`. */
  columnX: (groupIndex: number, seriesIndex: number) => number
}

/**
 * Splits `length` into `groupCount` bands, each holding `seriesCount` columns
 * of at most `maxColumn` with a `gap` of surface between neighbours. A group
 * never fills its band: at least 30% (and 8px) is left as air between groups.
 */
export function groupedLayout(groupCount: number, seriesCount: number, length: number, maxColumn = 24, gap = 2): GroupedLayout {
  const n = Math.max(1, seriesCount)
  const step = groupCount > 0 ? length / groupCount : length
  const room = Math.max(n, step - Math.max(8, step * 0.3))
  const column = Math.max(1, Math.min(maxColumn, (room - (n - 1) * gap) / n))
  const groupWidth = n * column + (n - 1) * gap
  return {
    step,
    column,
    groupWidth,
    columnX: (groupIndex, seriesIndex) => groupIndex * step + (step - groupWidth) / 2 + seriesIndex * (column + gap),
  }
}

/** Index of the entry in `positions` closest to `x`, or -1 when empty. */
export function nearestIndex(x: number, positions: number[]): number {
  let best = -1
  let bestDistance = Infinity
  positions.forEach((position, index) => {
    const distance = Math.abs(position - x)
    if (distance < bestDistance) {
      best = index
      bestDistance = distance
    }
  })
  return best
}

// ---- mark geometry ----------------------------------------------------------

/**
 * A horizontal bar growing right from `x`: square at the baseline (left),
 * rounded at the data end (right). The radius never exceeds half the bar.
 */
export function barPath(x: number, y: number, width: number, height: number, radius = 4): string {
  const w = Math.max(0, width)
  const r = Math.min(radius, w, height / 2)
  return `M ${x} ${y} H ${x + w - r} Q ${x + w} ${y} ${x + w} ${y + r} V ${y + height - r} Q ${x + w} ${y + height} ${x + w - r} ${y + height} H ${x} Z`
}

/**
 * A vertical column growing up from `baseline`: square at the baseline,
 * rounded at the top. A zero-height column draws nothing.
 */
export function columnPath(x: number, baseline: number, width: number, height: number, radius = 4): string {
  const h = Math.max(0, height)
  if (h === 0) return ''
  const r = Math.min(radius, width / 2, h)
  const top = baseline - h
  return `M ${x} ${baseline} V ${top + r} Q ${x} ${top} ${x + r} ${top} H ${x + width - r} Q ${x + width} ${top} ${x + width} ${top + r} V ${baseline} Z`
}

// ---- tooltip ----------------------------------------------------------------

export interface TooltipPlacement {
  /** CSS left / top, as a percentage of the plot box. */
  left: string
  top: string
  /** Moves the box clear of the anchor, flipping near the right and bottom edges. */
  transform: string
}

/**
 * Where a tooltip sits for an anchor given as fractions (0..1) of the plot
 * box. It opens right of and below the anchor, and flips left / above past the
 * midpoint so it never leaves the box. Percent positioning keeps it glued to
 * the mark however the SVG scales.
 */
export function tooltipPlacement(xFraction: number, yFraction: number, gap = 12): TooltipPlacement {
  const x = Math.min(1, Math.max(0, xFraction))
  const y = Math.min(1, Math.max(0, yFraction))
  const flipX = x > 0.5
  const flipY = y > 0.6
  return {
    left: `${round(x * 100)}%`,
    top: `${round(y * 100)}%`,
    transform: `translate(${flipX ? `calc(-100% - ${gap}px)` : `${gap}px`}, ${flipY ? `calc(-100% - ${gap}px)` : `${gap}px`})`,
  }
}

// ---- data shaping -----------------------------------------------------------

export interface YearSeries {
  year: number
  /** One entry per selected month, in order, 0 where the API sent nothing. */
  values: MonthlyPoint[]
}

/**
 * Splits timeseries `points` into one monthly series per year in `years`
 * (ascending, so the newest is last), each limited to `months`. A year with
 * no rows yields zeros rather than being dropped, so the legend and the
 * ramp stay stable.
 */
export function seriesByYear(points: TimeseriesPoint[], years: number[], months: number[]): YearSeries[] {
  return [...new Set(years)]
    .sort((a, b) => a - b)
    .map((year) => ({ year, values: buildMonthlySeries(points.filter((point) => point.year === year), months) }))
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

// ---- incident-type encoding --------------------------------------------------

export interface TypeEncoding {
  key: IncidentType
  label: string
  /** The type ink. Always drawn together with the registry mark (shape), never alone. */
  color: string
}

/** Ink and name per incident type; the mark (shape) is attached by typeSeries(). */
export const TYPE_ENCODING: Record<IncidentType, TypeEncoding> = {
  homicidio: { key: 'homicidio', label: TYPE_LABEL.homicidio.one, color: TYPE_COLOR.homicidio },
  sicariato: { key: 'sicariato', label: TYPE_LABEL.sicariato.one, color: TYPE_COLOR.sicariato },
  femicidio: { key: 'femicidio', label: TYPE_LABEL.femicidio.one, color: TYPE_COLOR.femicidio },
  desaparecida: { key: 'desaparecida', label: TYPE_LABEL.desaparecida.one, color: TYPE_COLOR.desaparecida },
}

// ---- pointer / focus interplay ------------------------------------------------

/**
 * A focus event that follows a pointer press within `windowMs` was caused by
 * the pointer (touch fires compat mousedown after pointerup), so it must not
 * override the item the pointer already selected.
 */
export function isPointerFocus(lastPointerDownAt: number | null, now: number, windowMs = 500): boolean {
  return lastPointerDownAt !== null && now - lastPointerDownAt >= 0 && now - lastPointerDownAt < windowMs
}

/** Touch fires pointerleave right after pointerup; clearing then would erase a tap. */
export function shouldClearOnLeave(pointerType: string): boolean {
  return pointerType !== 'touch'
}

// ---- labels -------------------------------------------------------------------

/** `text` cut to `maxChars` with an ellipsis. */
export function truncateLabel(text: string, maxChars: number): string {
  const max = Math.max(1, maxChars)
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/**
 * Nudges label positions apart so neighbours are at least `minGap` apart,
 * keeping them inside [min, max] and as close to their targets as possible.
 * Returned in the input order.
 */
export function spreadLabels(ys: number[], minGap: number, min = -Infinity, max = Infinity): number[] {
  const order = ys.map((_, i) => i).sort((a, b) => ys[a] - ys[b])
  const out = order.map((i) => Math.min(max, Math.max(min, ys[i])))
  for (let i = 1; i < out.length; i++) out[i] = Math.max(out[i], out[i - 1] + minGap)
  // If the push ran past `max`, clamp the last one and pull the stack back up.
  if (out.length > 0) out[out.length - 1] = Math.min(out[out.length - 1], max)
  for (let i = out.length - 2; i >= 0; i--) out[i] = Math.min(out[i], out[i + 1] - minGap)
  const result = new Array<number>(ys.length)
  order.forEach((original, i) => {
    result[original] = out[i]
  })
  return result
}

/** The series whose value at the active x is closest to the pointer's y (null values never win). */
export function nearestSeriesIndex(yPositions: (number | null)[], pointerY: number): number {
  return nearestIndex(pointerY, yPositions.map((y) => y ?? Infinity))
}

// ---- tables -------------------------------------------------------------------

export interface TableSeries {
  label: string
  values: (number | null)[]
}

/**
 * Header and rows of a multi-series line chart's table twin: one column per
 * series, plus (when `detailFor` is given) a column with the figure that goes
 * with each count, so the table holds everything the tooltip does.
 */
export function lineTable(
  categoryHeader: string,
  xLabels: string[],
  series: TableSeries[],
  format: (value: number) => string,
  detailFor?: (seriesIndex: number, pointIndex: number) => string | undefined,
  detailHeader = 'tasa',
): { headers: string[]; rows: string[][] } {
  const value = (v: number | null | undefined) => (v === null || v === undefined ? '—' : format(v))
  return {
    headers: [categoryHeader, ...series.flatMap((s) => (detailFor ? [s.label, `${s.label} (${detailHeader})`] : [s.label]))],
    rows: xLabels.map((label, i) => [
      label,
      ...series.flatMap((s, si) => (detailFor ? [value(s.values[i]), detailFor(si, i) ?? '—'] : [value(s.values[i])])),
    ]),
  }
}
