import { useId } from 'react'
import { CONFIDENCE_STYLE, INK, PAPER, markGeometry } from '../lib/marks'
import type { Confidence, IncidentType } from '../lib/registry'
import { CONFIDENCE, TYPE_COLOR } from '../lib/registry'

interface MarkProps {
  type: IncidentType
  confidence?: Confidence
  size?: number
  /** Override the type color, e.g. to show a confidence style neutrally. */
  color?: string
  className?: string
}

/** The registry mark as SVG; mirrors the canvas mark drawn on the map. */
export function Mark({ type, confidence = 'oficial', size = 18, color, className }: MarkProps) {
  const patternId = `hatch-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const g = markGeometry(type)
  const style = CONFIDENCE_STYLE[confidence]
  const hue = color ?? TYPE_COLOR[type]
  const dash = style.dash?.join(' ')
  const fill = style.fill === 'solid' ? hue : style.fill === 'hatch' ? `url(#${patternId})` : PAPER
  const outline = style.outline === 'ink' ? INK : hue

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      {style.fill === 'hatch' && (
        <defs>
          <pattern id={patternId} width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="3" height="3" fill={PAPER} />
            <line x1="0" y1="0" x2="0" y2="3" stroke={hue} strokeWidth="1.3" />
          </pattern>
        </defs>
      )}
      {g.outerRing && (
        <circle cx="12" cy="12" r={g.rOuter} fill="none" stroke={hue} strokeWidth="1.6" strokeDasharray={dash} />
      )}
      {g.disc ? (
        <circle
          cx="12"
          cy="12"
          r={g.rDisc}
          fill={fill}
          stroke={outline}
          strokeWidth={style.outline === 'ink' ? 1.1 : 1.6}
          strokeDasharray={dash}
        />
      ) : (
        <>
          <circle
            cx="12"
            cy="12"
            r={g.rDisc}
            fill={style.fill === 'hatch' ? fill : PAPER}
            stroke={hue}
            strokeWidth={style.fill === 'none' ? 2 : 3}
            strokeDasharray={dash}
          />
          <circle
            cx="12"
            cy="12"
            r={g.rDisc + 1.6}
            fill="none"
            stroke={INK}
            strokeWidth="0.9"
            strokeDasharray={style.outline === 'ink' ? dash : undefined}
          />
        </>
      )}
      {g.core && style.fill !== 'none' && <circle cx="12" cy="12" r={g.rCore} fill={PAPER} />}
    </svg>
  )
}

const NEUTRAL = '#56626e'

/** Confidence shown as its mark style (a neutral homicide-shaped disc) plus its name. */
export function ConfidenceChip({ confidence, muted = false }: { confidence: Confidence; muted?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${muted ? 'text-ink-3' : 'text-ink'}`}>
      <Mark type="homicidio" confidence={confidence} color={NEUTRAL} size={18} className={muted ? 'opacity-55' : ''} />
      {CONFIDENCE[confidence].label}
    </span>
  )
}
