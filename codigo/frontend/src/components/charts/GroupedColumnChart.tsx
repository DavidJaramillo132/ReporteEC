import type { ReactNode } from 'react'
import { columnPath, groupedLayout, lineTable, niceScale, tickGutter } from '../../lib/charts'
import { formatCount } from '../../lib/registry'
import { linearScale } from '../../lib/stats'
import { ChartFrame } from './ChartFrame'
import type { LegendItem } from './ChartFrame'
import { ChartPlot } from './ChartPlot'

export interface GroupSeries {
  key: string
  /** Legend, tooltip and table name. */
  label: string
  color: string
  /** A registry <Mark /> (18px): keys the legend and tooltip, and labels the newest group's columns. */
  marker?: ReactNode
}

export interface ColumnGroup {
  key: string
  /** X-axis label, e.g. the year. */
  label: string
  /** One value per series, in series order. */
  values: number[]
  /** The second figure per series (e.g. the rate), for the tooltip and table. */
  details?: string[]
}

interface GroupedColumnChartProps {
  title: string
  subtitle?: string
  groups: ColumnGroup[]
  series: GroupSeries[]
  /** Name of the measure in the tooltip and live region. Default "casos". */
  valueName?: string
  /** Header of the first table column. Default "Año". */
  categoryHeader?: string
  /** Header suffix of the detail table columns. Default "tasa". */
  detailHeader?: string
  emptyText?: string
  className?: string
}

const HEIGHT = 220
const PAD = { top: 26, right: 8, bottom: 26, left: 40 }
const CHAR_WIDTH = 6.8
const MARKER_SIZE = 18

/**
 * Columns grouped along an ordered axis (typically years), one column per
 * series in a fixed order, so each series keeps its place and colour in every
 * group and is compared on the shared zero baseline. Columns are at most 24px
 * with a 2px surface gap, square at every corner (DESIGN.md). The newest
 * (last) group carries each series' mark on its cap when there is room, as a
 * direct label; the legend, the tooltip (one readout per group, every series)
 * and the table carry the rest.
 */
export function GroupedColumnChart({
  title,
  subtitle,
  groups,
  series,
  valueName = 'casos',
  categoryHeader = 'Año',
  detailHeader = 'tasa',
  emptyText = 'No hay datos para este periodo.',
  className,
}: GroupedColumnChartProps) {
  const hasDetails = groups.some((g) => g.details)
  const table = {
    caption: `${title}: la misma información que el gráfico, en tabla.`,
    ...lineTable(
      categoryHeader,
      groups.map((g) => g.label),
      series.map((s, si) => ({ label: s.label, values: groups.map((g) => g.values[si] ?? null) })),
      formatCount,
      hasDetails ? (si, gi) => groups[gi].details?.[si] : undefined,
      detailHeader,
    ),
  }
  const legend: LegendItem[] = series.map((s) => ({ key: s.key, label: s.label, color: s.color, marker: s.marker }))

  if (groups.length === 0 || series.length === 0) {
    return (
      <ChartFrame title={title} subtitle={subtitle} table={table} className={className}>
        <p className="text-[13.5px] text-ink-3">{emptyText}</p>
      </ChartFrame>
    )
  }

  const describe = (gi: number) => {
    const g = groups[gi]
    const parts = series.map((s, si) => `${s.label} ${formatCount(g.values[si] ?? 0)}${g.details?.[si] ? ` (${g.details[si]})` : ''}`)
    return `${g.label}: ${parts.join(', ')} ${valueName}. ${gi + 1} de ${groups.length}.`
  }

  return (
    <ChartFrame title={title} subtitle={subtitle} legend={legend} table={table} className={className}>
      <ChartPlot
        count={groups.length}
        ariaLabel={`${title}. Gráfico de columnas agrupadas: ${groups.length} ${groups.length === 1 ? 'grupo' : 'grupos'} de ${series.length} ${series.length === 1 ? 'serie' : 'series'}.`}
        describe={describe}
        render={({ width, active, setActive }) => {
          const scale = niceScale(Math.max(0, ...groups.flatMap((g) => g.values)))
          const padLeft = tickGutter(scale.ticks.map(formatCount), PAD.left)
          const plotWidth = Math.max(40, width - padLeft - PAD.right)
          const baseline = HEIGHT - PAD.bottom
          const y = linearScale([0, scale.max], [baseline, PAD.top])
          const layout = groupedLayout(groups.length, series.length, plotWidth)
          const axisEvery = Math.max(1, Math.ceil((Math.max(...groups.map((g) => g.label.length)) * CHAR_WIDTH + 6) / layout.step))
          // Marks label the newest group's columns only when each fits over its column.
          const capSize = Math.min(14, layout.column + 2)
          const showCaps = series.some((s) => s.marker) && capSize >= 10
          const lastGroup = groups.length - 1

          const svg = (
            <>
              {scale.ticks.map((tick) => (
                <g key={tick}>
                  <line x1={padLeft} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} stroke="var(--color-rule-soft)" strokeWidth={1} />
                  <text x={padLeft - 6} y={y(tick) + 4} textAnchor="end" fontSize={11.5} fill="var(--color-ink-3)" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatCount(tick)}
                  </text>
                </g>
              ))}
              {groups.map((g, gi) => {
                const bandX = padLeft + gi * layout.step
                const centre = padLeft + layout.columnX(gi, 0) + layout.groupWidth / 2
                return (
                  <g key={g.key}>
                    {active === gi && <rect x={bandX} y={PAD.top - 18} width={layout.step} height={baseline - PAD.top + 18} fill="var(--color-paper-deep)" />}
                    {series.map((s, si) => {
                      const value = g.values[si] ?? 0
                      const x = padLeft + layout.columnX(gi, si)
                      return (
                        <g key={s.key} opacity={active !== null && active !== gi ? 0.55 : 1}>
                          <path d={columnPath(x, baseline, layout.column, baseline - y(value))} fill={s.color} />
                          {showCaps && gi === lastGroup && s.marker && (
                            <svg
                              x={x + layout.column / 2 - capSize / 2}
                              y={y(value) - capSize - 2}
                              width={capSize}
                              height={capSize}
                              viewBox={`0 0 ${MARKER_SIZE} ${MARKER_SIZE}`}
                              overflow="visible"
                            >
                              {s.marker}
                            </svg>
                          )}
                        </g>
                      )
                    })}
                    {gi % axisEvery === 0 && (
                      <text x={centre} y={HEIGHT - 8} textAnchor="middle" fontSize={11.5} fill="var(--color-ink-2)">
                        {g.label}
                      </text>
                    )}
                    <rect
                      x={bandX}
                      y={0}
                      width={layout.step}
                      height={HEIGHT}
                      fill="transparent"
                      onPointerEnter={() => setActive(gi)}
                      onPointerDown={() => setActive(gi)}
                      onPointerMove={() => setActive(gi)}
                    />
                  </g>
                )
              })}
              <line x1={padLeft} x2={width - PAD.right} y1={baseline + 0.5} y2={baseline + 0.5} stroke="var(--color-ink-3)" strokeWidth={1} />
            </>
          )

          const g = active !== null ? groups[active] : null
          return {
            svg,
            height: HEIGHT,
            tooltip:
              g && active !== null
                ? {
                    x: padLeft + layout.columnX(active, 0) + layout.groupWidth / 2,
                    // Anchored at the top of the plot: a readout of every series is tall and opens downward.
                    y: PAD.top,
                    content: {
                      title: g.label,
                      rows: series.map((s, si) => ({
                        label: s.label,
                        value: formatCount(g.values[si] ?? 0),
                        detail: g.details?.[si],
                        color: s.color,
                        marker: s.marker,
                      })),
                    },
                  }
                : null,
          }
        }}
      />
    </ChartFrame>
  )
}
