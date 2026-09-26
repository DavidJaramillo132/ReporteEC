import type { RefObject } from 'react'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { ConfidenceChip, Mark } from './Mark'
import type { IncidentDetail } from '../lib/api'
import { CONFIDENCE, TYPE_LABEL, entryNumber, formatLongDate, placeName } from '../lib/registry'

interface IncidentCardProps {
  /** null while the detail is still in flight for a just-clicked mark. */
  incident: IncidentDetail | null
  loadError: boolean
  lastUpdatedAt: string | null
  /** The selected mark's on-screen position within `containerRef`, from IncidentMap's onSelectedPoint; null once it (or the map) isn't ready to say. Ignored on the mobile bottom sheet. */
  point: { x: number; y: number } | null
  /** The map plate the card floats over, for clamping (desktop only). */
  containerRef: RefObject<HTMLElement | null>
  onClose: () => void
  onRetry: () => void
}

const DESKTOP_QUERY = '(min-width: 640px)'
const EDGE_GAP = 10
const POINT_GAP = 14

/**
 * The case detail, opened by clicking a mark (see IncidentMap's onSelect):
 * a floating card anchored to the point on desktop, a bottom sheet on
 * mobile. Closes via ×, Esc, or clicking empty map (that last one is
 * IncidentMap's job -- see its onDeselect). Give this component a fresh
 * `key` per incident id (see pages/Mapa.tsx) so the focus-on-open effect
 * below fires for every new selection, not just the first.
 */
export function IncidentCard({ incident, loadError, lastUpdatedAt, point, containerRef, onClose, onRetry }: IncidentCardProps) {
  const titleId = useId()
  const cardRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const [desktop, setDesktop] = useState(() => window.matchMedia(DESKTOP_QUERY).matches)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)

  useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY)
    const update = () => setDesktop(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [onClose])

  useLayoutEffect(() => {
    // Nothing to measure: the mobile bottom sheet ignores `position`
    // entirely (see containerClassName below), and a remaining stale value
    // from before never renders once `desktop`/`point` says not to.
    if (!desktop || !point) return
    const recompute = () => {
      const container = containerRef.current
      const card = cardRef.current
      if (!container || !card) return
      const bounds = container.getBoundingClientRect()
      const size = card.getBoundingClientRect()
      let left = point.x + POINT_GAP
      if (left + size.width > bounds.width - EDGE_GAP) left = point.x - POINT_GAP - size.width
      left = Math.max(EDGE_GAP, Math.min(left, bounds.width - size.width - EDGE_GAP))
      const top = Math.max(EDGE_GAP, Math.min(point.y - size.height / 2, bounds.height - size.height - EDGE_GAP))
      setPosition({ left, top })
    }
    recompute()
    window.addEventListener('resize', recompute)
    return () => window.removeEventListener('resize', recompute)
  }, [desktop, point, containerRef, incident, loadError])

  const containerClassName = desktop
    ? `absolute z-20 w-[min(320px,calc(100%-1.25rem))] border border-ink bg-sheet shadow-[0_6px_18px_-8px_rgba(21,33,44,0.35)] transition-opacity duration-150 ${
        position ? 'opacity-100' : 'opacity-0'
      }`
    : 'fixed inset-x-0 bottom-0 z-20 max-h-[75svh] overflow-y-auto border-t-[3px] border-ink bg-sheet shadow-[0_-6px_18px_-8px_rgba(21,33,44,0.35)]'

  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-labelledby={titleId}
      className={`ink-in ${containerClassName}`}
      style={desktop && position ? { left: position.left, top: position.top } : undefined}
    >
      <div className="flex items-start justify-between gap-3 border-b border-ink px-4 pt-3.5 pb-3">
        <h2
          id={titleId}
          ref={titleRef}
          tabIndex={-1}
          className="flex items-center gap-2 text-[18px] font-semibold outline-none"
        >
          {incident && <Mark type={incident.type} confidence={incident.confidence} size={20} />}
          {incident ? TYPE_LABEL[incident.type].one : 'Cargando caso…'}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="grid size-7 shrink-0 place-items-center border border-ink text-[15px] leading-none hover:bg-sello hover:text-paper"
        >
          ×
        </button>
      </div>

      <div className="px-4 pt-3 pb-4">
        {loadError ? (
          <div role="alert">
            <p className="text-[14px] text-ink-2">No se pudo cargar este caso.</p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 border border-ink px-3 py-1 text-[13px] font-medium hover:bg-sello hover:text-paper"
            >
              Reintentar
            </button>
          </div>
        ) : !incident ? (
          <div aria-busy="true" aria-live="polite" className="space-y-2">
            <p className="sr-only">Cargando el caso…</p>
            {[0, 1, 2].map((i) => (
              <div key={i} className="hatch h-4 border border-rule-soft" />
            ))}
          </div>
        ) : (
          <>
            <p className="text-[13.5px] text-ink-2">
              {formatLongDate(incident.date)} · {incident.time}
            </p>
            <p className="text-[13.5px] text-ink-2">
              {incident.canton_name ? placeName(incident.canton_name) : 'Cantón sin registrar'},{' '}
              {incident.province_name ? placeName(incident.province_name) : 'Provincia sin registrar'}
            </p>
            <p className="mt-1 text-[12px] font-semibold tabular-nums text-ink-3 [font-stretch:75%]">
              Caso N.º {entryNumber(incident.id)}
            </p>

            <h3 className="label mt-3 border-b border-ink pb-1 text-ink-3">Procedencia</h3>
            <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 text-[13px] [&>dd]:border-b [&>dd]:border-rule-soft [&>dd]:py-1.5 [&>dt]:border-b [&>dt]:border-rule-soft [&>dt]:py-1.5 [&>dt]:text-ink-3">
              <dt>Fuente</dt>
              <dd>{incident.source.publisher}</dd>
              <dt>Conjunto</dt>
              <dd>
                {incident.source.url ? (
                  <a href={incident.source.url} target="_blank" rel="noreferrer" className="underline hover:no-underline">
                    {incident.source.name}
                  </a>
                ) : (
                  incident.source.name
                )}
              </dd>
              <dt>Identificador</dt>
              <dd className="break-all">{incident.source_record_id}</dd>
              {lastUpdatedAt && (
                <>
                  <dt>Actualizado</dt>
                  <dd>{formatLongDate(lastUpdatedAt.slice(0, 10))}</dd>
                </>
              )}
              <dt>Confianza</dt>
              <dd>
                <ConfidenceChip confidence={incident.confidence} />
                <span className="block text-ink-3">{CONFIDENCE[incident.confidence].meaning}</span>
              </dd>
              <dt>Vigencia</dt>
              <dd>{`${Number(incident.date.slice(0, 4)) === new Date().getFullYear() ? 'Reciente' : 'Histórico'} · ${incident.date.slice(0, 4)}`}</dd>
              <dt>Ubicación</dt>
              <dd className="tabular-nums">
                Coordenada publicada por la fuente
                <span className="block text-ink-3">
                  {incident.lat.toFixed(4)}, {incident.lon.toFixed(4)}
                </span>
              </dd>
            </dl>
            <p className="mt-3 text-[12px] text-ink-3">ReporteEC no publica datos de las personas involucradas.</p>
          </>
        )}
      </div>
    </div>
  )
}
