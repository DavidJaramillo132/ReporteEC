import type { BandShape } from '../../lib/routeRisk'

/**
 * The semáforo's second channel: every band has its own shape, so a band
 * never depends on hue (DESIGN.md's scoped exception). Square for Seguro,
 * triangle for Precaución, diamond for Riesgo alto, octagon for Crítico;
 * a paper glyph inside repeats the reading.
 */
export function BandIcon({ shape, color, size = 28 }: { shape: BandShape; color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true" className="shrink-0">
      {shape === 'square' && (
        <>
          <rect x="3" y="3" width="22" height="22" fill={color} stroke="var(--color-ink)" strokeWidth="1" />
          <path d="M8.5 14.5l3.6 3.6 7.4-8" fill="none" stroke="var(--color-sheet)" strokeWidth="2.4" strokeLinecap="square" />
        </>
      )}
      {shape === 'triangle' && (
        <>
          <path d="M14 2.5L26 25H2z" fill={color} stroke="var(--color-ink)" strokeWidth="1" strokeLinejoin="miter" />
          <path d="M14 10v7.5" stroke="var(--color-ink)" strokeWidth="2.4" />
          <rect x="12.8" y="19.6" width="2.4" height="2.4" fill="var(--color-ink)" />
        </>
      )}
      {shape === 'diamond' && (
        <>
          <path d="M14 1.5L26.5 14 14 26.5 1.5 14z" fill={color} stroke="var(--color-ink)" strokeWidth="1" />
          <path d="M14 8.5v7" stroke="var(--color-sheet)" strokeWidth="2.4" />
          <rect x="12.8" y="17.6" width="2.4" height="2.4" fill="var(--color-sheet)" />
        </>
      )}
      {shape === 'octagon' && (
        <>
          <path d="M9.4 2h9.2L26 9.4v9.2L18.6 26H9.4L2 18.6V9.4z" fill={color} stroke="var(--color-ink)" strokeWidth="1" />
          <path d="M9.5 9.5l9 9M18.5 9.5l-9 9" stroke="var(--color-sheet)" strokeWidth="2.4" />
        </>
      )}
    </svg>
  )
}
