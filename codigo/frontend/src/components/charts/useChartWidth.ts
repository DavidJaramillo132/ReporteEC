import { useLayoutEffect, useRef, useState } from 'react'

/**
 * The rendered width of an element, tracked with a ResizeObserver. Charts lay
 * themselves out in that many viewBox units, so one unit is one CSS pixel at
 * any screen size and text keeps its real size (a fixed viewBox would shrink
 * labels to illegibility at 390px and inflate them on desktop).
 */
export function useChartWidth(fallback = 360) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(fallback)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const measure = () => {
      const next = Math.floor(element.getBoundingClientRect().width)
      if (next > 0) setWidth(next)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return { ref, width }
}
