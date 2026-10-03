import { useId, useState } from 'react'
import type { ReactNode } from 'react'

export interface LegendItem {
  key: string
  label: string
  color: string
  /** `rect` for bars and areas, `line` for lines. Ignored when `marker` is given. */
  shape?: 'rect' | 'line'
  /** A registry mark (shape + hue) that reinforces colour, e.g. <Mark type="homicidio" />. */
  marker?: ReactNode
}

export interface ChartTable {
  caption: string
  headers: string[]
  rows: string[][]
}

interface ChartFrameProps {
  title: string
  subtitle?: string
  /** Shown only with two or more entries: one series is named by the title. */
  legend?: LegendItem[]
  table: ChartTable
  children: ReactNode
  className?: string
}

/**
 * The container every chart sits in: a figure with its title, the legend (two
 * or more series only), the plot, and the «Ver tabla» toggle that reveals the
 * same numbers as a real table. The toggle is a button with aria-expanded.
 */
export function ChartFrame({ title, subtitle, legend, table, children, className }: ChartFrameProps) {
  const [showTable, setShowTable] = useState(false)
  const baseId = useId()
  const titleId = `${baseId}-title`
  const tableId = `${baseId}-table`

  return (
    <figure aria-labelledby={titleId} className={`m-0 ${className ?? ''}`}>
      <figcaption>
        <h3 id={titleId} className="label text-ink-3">
          {title}
        </h3>
        {subtitle && <p className="mt-0.5 max-w-[70ch] text-[13px] text-ink-2">{subtitle}</p>}
      </figcaption>

      {legend && legend.length >= 2 && (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-2" aria-label="Leyenda">
          {legend.map((item) => (
            <li key={item.key} className="inline-flex items-center gap-1.5">
              {item.marker ?? (
                <span
                  aria-hidden="true"
                  className={item.shape === 'line' ? 'h-0 w-4 border-t-2' : 'h-2.5 w-2.5'}
                  style={item.shape === 'line' ? { borderColor: item.color } : { backgroundColor: item.color }}
                />
              )}
              {item.label}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2">{children}</div>

      <button
        type="button"
        aria-expanded={showTable}
        aria-controls={tableId}
        onClick={() => setShowTable((open) => !open)}
        className="mt-2 inline-flex min-h-8 items-center gap-1 text-[12.5px] font-semibold text-ink-2 underline decoration-ink-3 underline-offset-2 hover:text-sello focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sello"
      >
        {showTable ? 'Ocultar tabla' : 'Ver tabla'}
      </button>

      <div id={tableId} hidden={!showTable} className="mt-1 overflow-x-auto">
        {showTable && (
          <table className="w-full border-collapse text-[12.5px]">
            <caption className="sr-only">{table.caption}</caption>
            <thead>
              <tr className="border-y border-ink">
                {table.headers.map((header, index) => (
                  <th key={header} scope="col" className={`label py-1 font-semibold text-ink-3 ${index === 0 ? 'text-left' : 'text-right'}`}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, rowIndex) => (
                <tr key={`${row[0]}-${rowIndex}`} className="border-b border-rule-soft">
                  {row.map((cell, index) =>
                    index === 0 ? (
                      <th key={index} scope="row" className="py-1 pr-2 text-left font-normal">
                        {cell}
                      </th>
                    ) : (
                      <td key={index} className="py-1 text-right tabular-nums">
                        {cell}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </figure>
  )
}
