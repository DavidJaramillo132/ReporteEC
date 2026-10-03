import type { ReactNode } from 'react'
import { tooltipPlacement } from '../../lib/charts'

export interface TooltipRow {
  /** Series or category name; secondary text. */
  label: string
  /** The number, the strong element. */
  value: string
  /** Extra line under the row, e.g. the rate that goes with a count. */
  detail?: string
  /** Colour of the short line key. Omit for a row with no series identity. */
  color?: string
  /** Optional shape key (e.g. a registry Mark) shown instead of the line key. */
  marker?: ReactNode
}

export interface TooltipContent {
  title: string
  rows: TooltipRow[]
}

interface ChartTooltipProps {
  content: TooltipContent
  /** Anchor as fractions (0..1) of the plot box. */
  x: number
  y: number
}

/**
 * The shared tooltip shell: values lead, labels follow, rows keyed by a short
 * line of the series colour. It is decorative for assistive tech (the plot
 * announces the same text through a live region), and every value in it is
 * also in the chart's table view. Text goes through React children, never HTML.
 */
export function ChartTooltip({ content, x, y }: ChartTooltipProps) {
  const placement = tooltipPlacement(x, y)
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute z-10 w-max max-w-[min(260px,80%)] border border-ink bg-sheet px-2.5 py-1.5 text-[12.5px] text-ink shadow-[2px_2px_0_var(--color-rule-soft)]"
      style={{ left: placement.left, top: placement.top, transform: placement.transform }}
    >
      <p className="label text-ink-3">{content.title}</p>
      <ul className="mt-1 space-y-1">
        {content.rows.map((row) => (
          <li key={row.label} className="flex items-start gap-2">
            {row.marker ?? (
              <span
                className="mt-[0.55em] h-0 w-3 shrink-0 border-t-2"
                style={{ borderColor: row.color ?? 'transparent' }}
              />
            )}
            <span>
              <span className="font-semibold tabular-nums">{row.value}</span>{' '}
              <span className="text-ink-2">{row.label}</span>
              {row.detail && <span className="block text-ink-3">{row.detail}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
