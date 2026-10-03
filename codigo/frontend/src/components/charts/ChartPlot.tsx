import { useId, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { isPointerFocus, shouldClearOnLeave } from '../../lib/charts'
import { ChartTooltip } from './ChartTooltip'
import type { TooltipContent } from './ChartTooltip'
import { useChartWidth } from './useChartWidth'

export interface PlotTooltip {
  content: TooltipContent
  /** Anchor in SVG units; converted to percentages of the plot box. */
  x: number
  y: number
}

export interface PlotRender {
  svg: ReactNode
  height: number
  tooltip: PlotTooltip | null
}

interface ChartPlotProps {
  /** Number of navigable positions (bars, columns or x steps). */
  count: number
  /** What the focusable plot is, read when it receives focus. */
  ariaLabel: string
  /** A sentence about position `index`, announced as the arrow keys move. */
  describe: (index: number) => string
  /** Lays the chart out for the measured width. `active` is hovered or keyboard index. */
  render: (context: { width: number; active: number | null; setActive: (index: number | null) => void }) => PlotRender
}

/**
 * The interactive box every chart draws into. It measures its width, owns the
 * active position shared by pointer and keyboard (the plot is ONE tab stop;
 * arrows, Home and End walk the marks, Escape dismisses), shows the tooltip
 * for it, and mirrors it to a polite live region. Hover and focus therefore
 * show exactly the same readout.
 */
export function ChartPlot({ count, ariaLabel, describe, render }: ChartPlotProps) {
  const { ref, width } = useChartWidth()
  const [active, setActive] = useState<number | null>(null)
  const hintId = useId()
  const lastPointerDown = useRef<number | null>(null)

  const last = count - 1
  const safeActive = active !== null && active <= last ? active : null
  const { svg, height, tooltip } = render({ width, active: safeActive, setActive })

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = safeActive ?? -1
    let next: number
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = Math.min(last, current + 1)
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = Math.max(0, current < 0 ? 0 : current - 1)
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = last
    else if (event.key === 'Escape') {
      setActive(null)
      return
    } else return
    event.preventDefault()
    setActive(next)
  }

  return (
    <div
      ref={ref}
      tabIndex={count > 0 ? 0 : -1}
      role="group"
      aria-label={ariaLabel}
      aria-describedby={hintId}
      onKeyDown={onKeyDown}
      onPointerDown={() => {
        lastPointerDown.current = performance.now()
      }}
      onFocus={() => {
        // A focus caused by a press keeps the item the pointer picked.
        if (isPointerFocus(lastPointerDown.current, performance.now())) return
        setActive((current) => current ?? 0)
      }}
      onBlur={() => setActive(null)}
      onPointerLeave={(event) => {
        if (shouldClearOnLeave(event.pointerType)) setActive(null)
      }}
      className="relative w-full max-w-full touch-pan-y focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sello"
    >
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden="true" className="block max-w-full">
        {svg}
      </svg>
      {tooltip && <ChartTooltip content={tooltip.content} x={tooltip.x / width} y={tooltip.y / height} />}
      <p id={hintId} className="sr-only" aria-live="polite">
        {safeActive !== null ? describe(safeActive) : 'Usa las flechas para recorrer los valores. La tabla tiene los mismos datos.'}
      </p>
    </div>
  )
}
