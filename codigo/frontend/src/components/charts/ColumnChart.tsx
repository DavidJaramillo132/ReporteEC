import type { ReactNode } from 'react'
import { SELLO, bandLayout, columnPath, niceScale, tickGutter } from '../../lib/charts'
import { formatCount } from '../../lib/registry'
import { linearScale } from '../../lib/stats'
import { ChartFrame } from './ChartFrame'
import type { LegendItem } from './ChartFrame'
import { ChartPlot } from './ChartPlot'

export interface ColumnDatum {
  key: string
  /** X-axis label, e.g. the year. */
  label: string
  value: number
  /** Direct label on the column cap. Defaults to the formatted value. */
  valueLabel?: string
  /** Second figure for the tooltip and table, e.g. the rate. */
  detail?: string
  /** Per-column colour, e.g. yearColor(year, years). Defaults to the chart colour. */
  color?: string
  /** A registry <Mark /> (18px) shown in the tooltip so shape backs up hue. */
  marker?: ReactNode
}

interface ColumnChartProps {
  title: string
  subtitle?: string
  data: ColumnDatum[]
  color?: string
  /** Name of the measure in the table and tooltip. Default "Casos". */
  valueHeader?: string
  /** Header of the table column that carries `detail`. */
  detailHeader?: string
  /** Header of the first table column. Default "Año". */
  categoryHeader?: string
  legend?: LegendItem[]
  emptyText?: string
  className?: string
  /** Plot height in px, axis labels included. Default 200. */
  height?: number
}

const HEIGHT = 200
const PAD = { top: 22, right: 8, bottom: 26, left: 40 }
const CHAR_WIDTH = 6.8

/**
 * Vertical columns over an ordered axis (typically years). Columns are at most
 * 24px wide and square at every corner (DESIGN.md), with the value on the
 * cap when it fits, otherwise only on the tallest column (the rest live in the
 * tooltip and the table). Hairline gridlines and clean ticks carry the scale.
 */
export function ColumnChart({
  title,
  subtitle,
  data,
  color = SELLO,
  valueHeader = 'Casos',
  detailHeader,
  categoryHeader = 'Año',
  legend,
  emptyText = 'No hay datos para este periodo.',
  className,
  height = HEIGHT,
}: ColumnChartProps) {
  const table = {
    caption: `${title}: la misma información que el gráfico, en tabla.`,
    headers: [categoryHeader, valueHeader, ...(detailHeader ? [detailHeader] : [])],
    rows: data.map((d) => [d.label, formatCount(d.value), ...(detailHeader ? [d.detail ?? '—'] : [])]),
  }

  if (data.length === 0) {
    return (
      <ChartFrame title={title} subtitle={subtitle} table={table} className={className}>
        <p className="text-[13.5px] text-ink-3">{emptyText}</p>
      </ChartFrame>
    )
  }

  const valueText = (d: ColumnDatum) => d.valueLabel ?? formatCount(d.value)
  const maxIndex = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0)
  const describe = (i: number) => {
    const d = data[i]
    return `${d.label}: ${formatCount(d.value)} ${valueHeader.toLowerCase()}${d.detail ? `, ${d.detail}` : ''}. ${i + 1} de ${data.length}.`
  }

  return (
    <ChartFrame title={title} subtitle={subtitle} legend={legend} table={table} className={className}>
      <ChartPlot
        count={data.length}
        ariaLabel={`${title}. Gráfico de columnas con ${data.length} ${data.length === 1 ? 'valor' : 'valores'}.`}
        describe={describe}
        render={({ width, active, setActive }) => {
          const scale = niceScale(Math.max(...data.map((d) => d.value)))
          const padLeft = tickGutter(scale.ticks.map(formatCount), PAD.left)
          const plotWidth = Math.max(40, width - padLeft - PAD.right)
          const baseline = height - PAD.bottom
          const y = linearScale([0, scale.max], [baseline, PAD.top])
          const layout = bandLayout(data.length, plotWidth)
          const labelsFit = data.every((d) => valueText(d).length * CHAR_WIDTH + 4 <= layout.step)
          const axisEvery = Math.max(1, Math.ceil((Math.max(...data.map((d) => d.label.length)) * CHAR_WIDTH + 6) / layout.step))

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
              {data.map((d, i) => {
                const bandX = padLeft + i * layout.step
                const colX = padLeft + layout.start(i)
                const top = y(d.value)
                const showLabel = labelsFit || i === maxIndex
                return (
                  <g key={d.key}>
                    {active === i && <rect x={bandX} y={PAD.top - 14} width={layout.step} height={baseline - PAD.top + 14} fill="var(--color-paper-deep)" />}
                    <path d={columnPath(colX, baseline, layout.thickness, baseline - top)} fill={d.color ?? color} opacity={active !== null && active !== i ? 0.55 : 1} />
                    {showLabel && (
                      <text x={colX + layout.thickness / 2} y={top - 6} textAnchor="middle" fontSize={12} fontWeight={600} fill="var(--color-ink)">
                        {valueText(d)}
                      </text>
                    )}
                    {i % axisEvery === 0 && (
                      <text x={colX + layout.thickness / 2} y={height - 8} textAnchor="middle" fontSize={11.5} fill="var(--color-ink-2)">
                        {d.label}
                      </text>
                    )}
                    <rect
                      x={bandX}
                      y={0}
                      width={layout.step}
                      height={height}
                      fill="transparent"
                      onPointerEnter={() => setActive(i)}
                      onPointerDown={() => setActive(i)}
                      onPointerMove={() => setActive(i)}
                    />
                  </g>
                )
              })}
              <line x1={padLeft} x2={width - PAD.right} y1={baseline + 0.5} y2={baseline + 0.5} stroke="var(--color-ink-3)" strokeWidth={1} />
            </>
          )

          const d = active !== null ? data[active] : null
          return {
            svg,
            height,
            tooltip:
              d && active !== null
                ? {
                    x: padLeft + layout.start(active) + layout.thickness / 2,
                    y: y(d.value),
                    content: {
                      title: d.label,
                      rows: [{ label: valueHeader.toLowerCase(), value: formatCount(d.value), detail: d.detail, color: d.color ?? color, marker: d.marker }],
                    },
                  }
                : null,
          }
        }}
      />
    </ChartFrame>
  )
}
