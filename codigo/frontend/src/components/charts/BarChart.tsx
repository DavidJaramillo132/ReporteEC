import type { ReactNode } from 'react'
import { SELLO, barPath } from '../../lib/charts'
import { formatCount } from '../../lib/registry'
import { linearScale } from '../../lib/stats'
import { ChartFrame } from './ChartFrame'
import type { LegendItem } from './ChartFrame'
import { ChartPlot } from './ChartPlot'

export interface BarDatum {
  key: string
  label: string
  value: number
  /** Direct label at the bar tip. Defaults to the formatted value. */
  valueLabel?: string
  /** Second figure for the tooltip and table, e.g. the rate that goes with the count. */
  detail?: string
  /** Per-bar colour (e.g. an incident-type ink). Defaults to the chart colour. */
  color?: string
  /** A registry <Mark /> (18px) drawn before the label so shape backs up hue. */
  marker?: ReactNode
}

interface BarChartProps {
  title: string
  subtitle?: string
  /** Rows in the order to draw; sort before passing (a ranking is sorted by the caller). */
  data: BarDatum[]
  /** One colour for every bar when the categories are nominal. Default `sello`. */
  color?: string
  /** Name of the measure in the table and tooltip. Default "Casos". */
  valueHeader?: string
  /** Header of the table column that carries `detail`, e.g. "Tasa por 100.000". */
  detailHeader?: string
  /** Legend entries; only drawn with two or more (e.g. one per incident type). */
  legend?: LegendItem[]
  emptyText?: string
  className?: string
}

const ROW_HEIGHT = 44
const BAR_THICKNESS = 14
const LABEL_BASELINE = 14
const MARKER_SIZE = 18
const CHAR_WIDTH = 6.8

/**
 * Horizontal ranked bars: one row per category, label above its bar, the value
 * at the bar tip. Bars are at most 24px thick, square at the baseline and
 * rounded at the data end. The label's room is reserved before scaling, so a
 * value is never clipped by its own bar.
 */
export function BarChart({
  title,
  subtitle,
  data,
  color = SELLO,
  valueHeader = 'Casos',
  detailHeader,
  legend,
  emptyText = 'No hay datos para este periodo.',
  className,
}: BarChartProps) {
  const table = {
    caption: `${title}: la misma información que el gráfico, en tabla.`,
    headers: ['Categoría', valueHeader, ...(detailHeader ? [detailHeader] : [])],
    rows: data.map((d) => [d.label, formatCount(d.value), ...(detailHeader ? [d.detail ?? '—'] : [])]),
  }

  if (data.length === 0) {
    return (
      <ChartFrame title={title} subtitle={subtitle} table={table} className={className}>
        <p className="text-[13.5px] text-ink-3">{emptyText}</p>
      </ChartFrame>
    )
  }

  const valueText = (d: BarDatum) => d.valueLabel ?? formatCount(d.value)
  const describe = (i: number) => {
    const d = data[i]
    return `${d.label}: ${formatCount(d.value)} ${valueHeader.toLowerCase()}${d.detail ? `, ${d.detail}` : ''}. ${i + 1} de ${data.length}.`
  }

  return (
    <ChartFrame title={title} subtitle={subtitle} legend={legend} table={table} className={className}>
      <ChartPlot
        count={data.length}
        ariaLabel={`${title}. Gráfico de barras con ${data.length} ${data.length === 1 ? 'valor' : 'valores'}.`}
        describe={describe}
        render={({ width, active, setActive }) => {
          const height = data.length * ROW_HEIGHT
          const reserve = Math.max(...data.map((d) => valueText(d).length)) * CHAR_WIDTH + 10
          const max = Math.max(1, ...data.map((d) => d.value))
          const x = linearScale([0, max], [0, Math.max(10, width - reserve)])
          const maxChars = Math.max(6, Math.floor(width / CHAR_WIDTH))

          const svg = (
            <>
              {data.map((d, i) => {
                const top = i * ROW_HEIGHT
                const barY = top + 22
                const barWidth = x(d.value)
                const labelX = d.marker ? MARKER_SIZE + 6 : 0
                const text = d.label.length > maxChars ? `${d.label.slice(0, maxChars - 1)}…` : d.label
                const fill = d.color ?? color
                return (
                  <g key={d.key}>
                    {active === i && <rect x={0} y={top + 2} width={width} height={ROW_HEIGHT - 4} fill="var(--color-paper-deep)" />}
                    {d.marker && (
                      <svg x={0} y={top + 2} width={MARKER_SIZE} height={MARKER_SIZE} overflow="visible">
                        {d.marker}
                      </svg>
                    )}
                    <text x={labelX} y={top + LABEL_BASELINE + 4} fontSize={12.5} fill="var(--color-ink-2)">
                      {text}
                    </text>
                    <path
                      d={barPath(0, barY, barWidth, BAR_THICKNESS)}
                      fill={fill}
                      opacity={active !== null && active !== i ? 0.55 : 1}
                    />
                    <text
                      x={barWidth + 6}
                      y={barY + BAR_THICKNESS - 2.5}
                      fontSize={12.5}
                      fontWeight={600}
                      fill="var(--color-ink)"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {valueText(d)}
                    </text>
                    <rect
                      x={0}
                      y={top}
                      width={width}
                      height={ROW_HEIGHT}
                      fill="transparent"
                      onPointerEnter={() => setActive(i)}
                      onPointerDown={() => setActive(i)}
                      onPointerMove={() => setActive(i)}
                    />
                  </g>
                )
              })}
              <line x1={0.5} x2={0.5} y1={0} y2={height} stroke="var(--color-ink-3)" strokeWidth={1} />
            </>
          )

          const d = active !== null ? data[active] : null
          return {
            svg,
            height,
            tooltip:
              d && active !== null
                ? {
                    x: Math.min(width, x(d.value)),
                    y: active * ROW_HEIGHT + 22,
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
