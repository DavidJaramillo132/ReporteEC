import { nearestIndex, niceScale } from '../../lib/charts'
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
  /** Second figure for a point (e.g. the rate), shown in the tooltip. */
  detailFor?: (seriesIndex: number, pointIndex: number) => string | undefined
  /** Legend entries; defaults to one per series. Only drawn with two or more. */
  legend?: LegendItem[]
  emptyText?: string
  className?: string
}

const HEIGHT = 220
const PAD = { top: 14, right: 44, bottom: 26, left: 40 }
const CHAR_WIDTH = 6.8

/**
 * Multi-series lines over a shared x axis. 2px lines with round joins, an
 * end-dot with a surface ring on each series, hairline grid and one shared
 * crosshair that snaps to the nearest x and reads out every series at once. The
 * series are labelled at their right end only when the ends don't collide;
 * otherwise the legend and the tooltip carry identity. A single series gets a
 * 10% area wash. No second axis, ever.
 */
export function LineChart({
  title,
  subtitle,
  xLabels,
  series,
  valueName = 'casos',
  categoryHeader = 'Mes',
  detailFor,
  legend,
  emptyText = 'No hay datos para este periodo.',
  className,
}: LineChartProps) {
  const fmt = (value: number | null) => (value === null ? '—' : formatCount(value))
  const table = {
    caption: `${title}: la misma información que el gráfico, en tabla.`,
    headers: [categoryHeader, ...series.map((s) => s.label)],
    rows: xLabels.map((label, i) => [label, ...series.map((s) => fmt(s.values[i] ?? null))]),
  }
  const legendItems: LegendItem[] = legend ?? series.map((s) => ({ key: s.key, label: s.label, color: s.color, shape: 'line' }))

  if (xLabels.length < 2 || series.length === 0) {
    return (
      <ChartFrame title={title} subtitle={subtitle} table={table} className={className}>
        <p className="text-[13.5px] text-ink-3">{emptyText}</p>
      </ChartFrame>
    )
  }

  const describe = (i: number) =>
    `${xLabels[i]}: ${series.map((s, si) => `${fmt(s.values[i] ?? null)} ${s.label}${detailFor?.(si, i) ? ` (${detailFor(si, i)})` : ''}`).join(', ')} ${valueName}. ${i + 1} de ${xLabels.length}.`
  const maxValue = Math.max(0, ...series.flatMap((s) => s.values.filter((v): v is number => v !== null)))

  return (
    <ChartFrame title={title} subtitle={subtitle} legend={legendItems} table={table} className={className}>
      <ChartPlot
        count={xLabels.length}
        ariaLabel={`${title}. Gráfico de líneas con ${series.length} ${series.length === 1 ? 'serie' : 'series'} y ${xLabels.length} posiciones.`}
        describe={describe}
        render={({ width, active, setActive }) => {
          const scale = niceScale(maxValue)
          const baseline = HEIGHT - PAD.bottom
          const x = linearScale([0, xLabels.length - 1], [PAD.left, width - PAD.right])
          const y = linearScale([0, scale.max], [baseline, PAD.top])
          const xs = xLabels.map((_, i) => x(i))
          const axisEvery = Math.max(1, Math.ceil((Math.max(...xLabels.map((l) => l.length)) * CHAR_WIDTH + 8) / (xs[1] - xs[0])))

          // Series ends, for direct labels: only when no two would overlap.
          const ends = series.map((s) => {
            const index = s.values.reduce<number>((last, v, i) => (v !== null ? i : last), -1)
            return index === -1 ? null : { index, y: y(s.values[index] as number) }
          })
          const endYs = ends.filter((e) => e !== null).map((e) => e.y).sort((a, b) => a - b)
          const endLabelsFit = endYs.every((v, i) => i === 0 || v - endYs[i - 1] >= 13)
          const longest = Math.max(...series.map((s) => s.label.length))
          const showEndLabels = endLabelsFit && longest * CHAR_WIDTH <= PAD.right - 10

          const svg = (
            <>
              {scale.ticks.map((tick) => (
                <g key={tick}>
                  <line x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} stroke="var(--color-rule-soft)" strokeWidth={1} />
                  <text x={PAD.left - 6} y={y(tick) + 4} textAnchor="end" fontSize={11.5} fill="var(--color-ink-3)" style={{ fontVariantNumeric: 'tabular-nums' }}>
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
                return (
                  <g key={s.key}>
                    {series.length === 1 &&
                      runs.map((run, ri) =>
                        run.length > 1 ? (
                          <path key={`area-${ri}`} d={`${buildLinePath(run)} L ${run[run.length - 1].x} ${baseline} L ${run[0].x} ${baseline} Z`} fill={s.color} fillOpacity={0.1} />
                        ) : null,
                      )}
                    {runs.map((run, ri) => (
                      <path key={ri} d={buildLinePath(run)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                    ))}
                    {end && (
                      <>
                        <circle cx={xs[end.index]} cy={end.y} r={4} fill={s.color} stroke="var(--color-paper)" strokeWidth={2} />
                        {showEndLabels && (
                          <text x={xs[end.index] + 9} y={end.y + 4} fontSize={11.5} fontWeight={600} fill="var(--color-ink-2)">
                            {s.label}
                          </text>
                        )}
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
                onPointerMove={(event) => {
                  const box = event.currentTarget.getBoundingClientRect()
                  setActive(nearestIndex(((event.clientX - box.left) / box.width) * width, xs))
                }}
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
                      rows: series.map((s, si) => ({ label: s.label, value: fmt(s.values[active] ?? null), color: s.color, detail: detailFor?.(si, active) })),
                    },
                  }
                : null,
          }
        }}
      />
    </ChartFrame>
  )
}

