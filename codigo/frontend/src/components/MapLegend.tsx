import { useId, useState } from 'react'
import { ConfidenceChip, Mark } from './Mark'
import type { Confidence, IncidentType } from '../lib/registry'
import { CONFIDENCE_ORDER, TYPE_LABEL } from '../lib/registry'

interface MapLegendProps {
  types: IncidentType[]
  presentConfidence: Confidence[]
  detentions: boolean
  zoomedOut: boolean
}

/** Printed key in the lower margin of the plate. */
export function MapLegend({ types, presentConfidence, detentions, zoomedOut }: MapLegendProps) {
  const [open, setOpen] = useState(() => window.matchMedia('(min-width: 1024px)').matches)
  const bodyId = useId()
  return (
    <div className="pointer-events-auto absolute bottom-3 left-3 z-10 w-[min(250px,calc(100%-1.5rem))] border border-ink bg-sheet/95 text-[12.5px] shadow-[0_4px_14px_-8px_rgba(21,33,44,0.4)]">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-paper ${open ? 'border-b border-ink' : ''}`}
      >
        <span className="label text-ink-3">Clave</span>
        <span className="text-[12px] text-ink-2">{open ? 'Ocultar' : 'Mostrar'}</span>
      </button>
      <div id={bodyId} hidden={!open} className="space-y-2 px-3 py-2.5">
        <div>
          <p className="text-ink-3">Color y forma: tipo</p>
          <ul className="mt-1 space-y-0.5">
            {types.map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <Mark type={t} size={16} />
                {TYPE_LABEL[t].one}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-ink-3">Trazo: confianza</p>
          <ul className="mt-1 grid grid-cols-2 gap-x-2 gap-y-1">
            {CONFIDENCE_ORDER.map((c) => (
              <li key={c}>
                <ConfidenceChip confidence={c} muted={!presentConfidence.includes(c)} />
              </li>
            ))}
          </ul>
        </div>
        {zoomedOut && !detentions && (
          <p className="flex items-center gap-2 border-t border-rule-soft pt-2 text-ink-2">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-8 bg-[linear-gradient(90deg,rgba(29,74,115,0.08),rgba(29,74,115,0.68))]"
            />
            Concentración de casos
          </p>
        )}
        {detentions && (
          <p className="flex items-center gap-2 border-t border-rule-soft pt-2 text-ink-2">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-8 shrink-0 bg-[linear-gradient(90deg,rgba(86,98,110,0.08),rgba(56,69,82,0.62))]"
            />
            <span>
              Detenciones: actividad policial
              <span className="block text-ink-3">Reemplaza la concentración de casos mientras está activa.</span>
            </span>
          </p>
        )}
      </div>
    </div>
  )
}
