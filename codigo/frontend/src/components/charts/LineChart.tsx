import { useState } from 'react'
import type { PointerEvent, ReactNode } from 'react'
import { lineTable, nearestIndex, nearestSeriesIndex, niceScale, spreadLabels, truncateLabel } from '../../lib/charts'
import { formatCount } from '../../lib/registry'
import { buildLinePath, linearScale } from '../../lib/stats'
import { ChartFrame } from './ChartFrame'
import type { LegendItem } from './ChartFrame'
import { ChartPlot } from './ChartPlot'

export interface LineSeries {
  key: string
  /** Legend, tooltip and table name, e.g. "2025". */
  label: string
  color: string
  /** One value per x position; null leaves a gap (nothing published). */
  values: (number | null)[]
  /** A registry <Mark /> (18px): replaces the end dot, and keys the legend and tooltip row. */
  marker?: ReactNode
}

interface LineChartProps {
  title: string
  subtitle?: string
  /** X positions in order, e.g. month names. Every series has one value per entry. */
  xLabels: string[]
  series: LineSeries[]
  /** Name of the measure in the tooltip and live region. Default "casos". */
  valueName?: string
  /** Header of the first table column. Default "Mes". */
  categoryHeader?: string
  /** Second figure for a point (e.g. the rate), shown in the tooltip and as extra table columns. */
  detailFor?: (seriesIndex: number, pointIndex: number) => string | undefined
  /** Header suffix of the detail table columns. Default "tasa". */
  detailHeader?: string
  /** Legend entries; defaults to one per series. Only drawn with two or more. */
  legend?: LegendItem[]
  emptyText?: string
  className?: string
}

const HEIGHT = 220
const PAD = { top: 14, bottom: 26, left: 40 }
const MIN_RIGHT = 44
const CHAR_WIDTH = 6.8
const MARKER_SIZE = 18

/**
 * Multi-series lines over a shared x axis (one point is fine: it draws the lone
 * point). 2px lines, an end-dot (or the series' registry mark) with a surface
 * ring, hairline grid and one crosshair that snaps to the nearest x and reads
 * out every series. Emphasis: hovering the plot (nearest line) or a legend
 * entry dims the other series and thickens that one. End labels are always
 * drawn, nudged apart when ends collide; the right margin grows to fit the
 * longest name. A single series gets a 10% area wash. No second axis.
 */
export function LineChart({
  title,
  subtitle,
  xLabels,
  series,
  valueName = 'casos',
  categoryHeader = 'Mes',
  detailFor,
  detailHeader = 'tasa',
  legend,
  emptyText = 'No hay datos para este periodo.',
  className,
}: LineChartProps) {
  const [legendKey, setLegendKey] = useState<string | null>(null)
  const [plotKey, setPlotKey] = useState<string | null>(null)
  const emphasis = legendKey ?? plotKey

  const fmt = (value: number | null) => (value === null ? '—' : formatCount(value))
  const table = {
    caption: `${title}: la misma información que el gráfico, en tabla.`,
    ...lineTable(categoryHeader, xLabels, series, formatCount, detailFor, detailHeader),
  }
  const legendItems: LegendItem[] =
    legend ?? series.map((s) => ({ key: s.key, label: s.label, color: s.color, shape: 'line', marker: s.marker }))

  const hasData = series.some((s) => s.values.some((v) => v !== null))
  if (xLabels.length < 1 || series.length === 0 || !hasData) {
    return (
      <ChartFrame title={title} subtitle={subtitle} table={table} className={className}>
        <p className="text-[13.5px] text-ink-3">{emptyText}</p>
      </ChartFrame>
    )
  }

  const describe = (i: number) =>
    `${xLabels[i]}: ${series.map((s, si) => `${fmt(s.values[i] ?? null)} ${s.label}${detailFor?.(si, i) ? ` (${detailFor(si, i)})` : ''}`).join(', ')} ${valueName}. ${i + 1} de ${xLabels.length}.`
  const maxValue = Math.max(0, ...series.flatMap((s) => s.values.filter((v): v is number => v !== null)))
  const longest = Math.max(...series.map((s) => s.label.length))

  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      legend={legendItems}
      highlightKey={emphasis}
      onHighlight={series.length >= 2 ? setLegendKey : undefined}
      table={table}
      className={className}
    >
      <ChartPlot
        count={xLabels.length}
        ariaLabel={`${title}. Gráfico de líneas con ${series.length} ${series.length === 1 ? 'serie' : 'series'} y ${xLabels.length} ${xLabels.length === 1 ? 'posición' : 'posiciones'}.`}
        describe={describe}
        render={({ width, active, setActive }) => {
          // The right margin fits the longest end label (capped so the plot keeps room).
          const padRight = Math.max(MIN_RIGHT, Math.min(width * 0.3, longest * CHAR_WIDTH + 18))
          const maxChars = Math.floor((padRight - 14) / CHAR_WIDTH)
          const scale = niceScale(maxValue)
          const baseline = HEIGHT - PAD.bottom
          const x0 = PAD.left
          const x1 = width - padRight
          // One point sits in the middle of the plot; linearScale would pin it to the left.
          const xAt = (i: number) => (xLabels.length === 1 ? (x0 + x1) / 2 : linearScale([0, xLabels.length - 1], [x0, x1])(i))
          const y = linearScale([0, scale.max], [baseline, PAD.top])
          const xs = xLabels.map((_, i) => xAt(i))
          const step = xs.length > 1 ? xs[1] - xs[0] : width
          const axisEvery = Math.max(1, Math.ceil((Math.max(...xLabels.map((l) => l.length)) * CHAR_WIDTH + 8) / step))

          const ends = series.map((s) => {
            const index = s.values.reduce<number>((last, v, i) => (v !== null ? i : last), -1)
            return index === -1 ? null : { index, y: y(s.values[index] as number) }
          })
          // Nudge colliding end labels apart (kept in series order).
          const labelable = ends.flatMap((e, si) => (e ? [si] : []))
          const spread = spreadLabels(labelable.map((si) => (ends[si] as { y: number }).y), 13, PAD.top, baseline)
          const labelY = new Map(labelable.map((si, k) => [si, spread[k]]))

          const dim = (key: string) => emphasis !== null && emphasis !== key

          function pick(event: PointerEvent<SVGRectElement>) {
            const box = event.currentTarget.getBoundingClientRect()
            const index = nearestIndex(((event.clientX - box.left) / box.width) * width, xs)
            setActive(index)
            if (index >= 0 && series.length >= 2) {
              const pointerY = ((event.clientY - box.top) / box.height) * HEIGHT
              const nearest = nearestSeriesIndex(series.map((s) => (s.values[index] === null || s.values[index] === undefined ? null : y(s.values[index] as number))), pointerY)
              setPlotKey(nearest >= 0 ? series[nearest].key : null)
            }
          }

          const svg = (
            <>
              {scale.ticks.map((tick) => (
                <g key={tick}>
                  <line x1={x0} x2={width - padRight} y1={y(tick)} y2={y(tick)} stroke="var(--color-rule-soft)" strokeWidth={1} />
                  <text x={x0 - 6} y={y(tick) + 4} textAnchor="end" fontSize={11.5} fill="var(--color-ink-3)" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatCount(tick)}
                  </text>
                </g>
              ))}
              {xLabels.map((label, i) =>
                i % axisEvery === 0 ? (
                  <text key={label + i} x={xs[i]} y={HEIGHT - 8} textAnchor="middle" fontSize={11.5} fill="var(--color-ink-2)">
                    {label}
                  </text>
                ) : null,
              )}
              {active !== null && <line x1={xs[active]} x2={xs[active]} y1={PAD.top} y2={baseline} stroke="var(--color-ink-3)" strokeWidth={1} />}
              {series.map((s, si) => {
                // Gaps (null) split the line into separate runs.
                const runs: { x: number; y: number }[][] = []
                s.values.forEach((value, i) => {
                  if (value === null) {
                    runs.push([])
                    return
                  }
                  if (runs.length === 0) runs.push([])
                  runs[runs.length - 1].push({ x: xs[i], y: y(value) })
                })
                const end = ends[si]
                const dimmed = dim(s.key)
                const strong = emphasis === s.key
                return (
                  <g key={s.key} opacity={dimmed ? 0.25 : 1}>
                    {series.length === 1 &&
                      runs.map((run, ri) =>
                        run.length > 1 ? (
                          <path key={`area-${ri}`} d={`${buildLinePath(run)} L ${run[run.length - 1].x} ${baseline} L ${run[0].x} ${baseline} Z`} fill={s.color} fillOpacity={0.1} />
                        ) : null,
                      )}
                    {runs.map((run, ri) => (
                      <path key={ri} d={buildLinePath(run)} fill="none" stroke={s.color} strokeWidth={strong ? 3.5 : 2} strokeLinejoin="round" strokeLinecap="round" />
                    ))}
                    {end && (
                      <>
                        {s.marker ? (
                          <svg x={xs[end.index] - MARKER_SIZE / 2} y={end.y - MARKER_SIZE / 2} width={MARKER_SIZE} height={MARKER_SIZE} overflow="visible">
                            {s.marker}
                          </svg>
                        ) : (
                          <circle cx={xs[end.index]} cy={end.y} r={4} fill={s.color} stroke="var(--color-paper)" strokeWidth={2} />
                        )}
                        <text x={xs[end.index] + (s.marker ? MARKER_SIZE / 2 + 3 : 9)} y={(labelY.get(si) ?? end.y) + 4} fontSize={11.5} fontWeight={strong ? 700 : 600} fill="var(--color-ink-2)">
                          <title>{s.label}</title>
                          {truncateLabel(s.label, maxChars)}
                        </text>
                      </>
                    )}
                    {active !== null && s.values[active] !== null && active !== end?.index && (
                      <circle cx={xs[active]} cy={y(s.values[active] as number)} r={4} fill={s.color} stroke="var(--color-paper)" strokeWidth={2} />
                    )}
                  </g>
                )
              })}
              <rect
                x={0}
                y={0}
                width={width}
                height={HEIGHT}
                fill="transparent"
                onPointerEnter={pick}
                onPointerDown={pick}
                onPointerMove={pick}
                onPointerLeave={() => setPlotKey(null)}
              />
            </>
          )

          return {
            svg,
            height: HEIGHT,
            tooltip:
              active !== null
                ? {
                    x: xs[active],
                    y: PAD.top + (baseline - PAD.top) * 0.25,
                    content: {
                      title: xLabels[active],
                      rows: series.map((s, si) => ({ label: s.label, value: fmt(s.values[active] ?? null), color: s.color, marker: s.marker, detail: detailFor?.(si, active) })),
                    },
                  }
                : null,
          }
        }}
      />
    </ChartFrame>
  )
}
