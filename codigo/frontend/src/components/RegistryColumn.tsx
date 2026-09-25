import { useState } from 'react'
import { ConfidenceChip, Mark } from './Mark'
import type { Incident, IncidentType } from '../lib/registry'
import {
  CONFIDENCE,
  INCIDENT_TYPES,
  SOURCES,
  TYPE_LABEL,
  entryNumber,
  formatCount,
  formatLongDate,
  formatShortDate,
  placeName,
} from '../lib/registry'

const PAGE = 40

interface RegistryColumnProps {
  status: 'loading' | 'error' | 'ready'
  inView: Incident[]
  periodLabel: string
  zoomedOut: boolean
  selected: Incident | null
  onSelect: (incident: Incident) => void
  onCloseDetail: () => void
  onRetry: () => void
  onOpenMethodology: () => void
}

export function RegistryColumn(props: RegistryColumnProps) {
  const { status, inView, selected } = props
  const [shown, setShown] = useState(PAGE)

  if (status === 'loading') return <LoadingState />
  if (status === 'error') return <ErrorState onRetry={props.onRetry} />

  const counts = INCIDENT_TYPES.reduce(
    (acc, t) => ({ ...acc, [t]: 0 }),
    {} as Record<IncidentType, number>,
  )
  for (const i of inView) counts[i.properties.tipo] += 1

  return (
    <div className="flex min-h-0 flex-col">
      {selected && <EntryDetail incident={selected} onClose={props.onCloseDetail} />}

      <section aria-labelledby="summary-title" className="border-b border-ink px-4 py-4 lg:px-5">
        <h2 id="summary-title" className="text-[19px] leading-tight font-semibold">
          Registro de la vista actual
        </h2>
        <p className="mt-1 text-[14px] text-ink-2" aria-live="polite">
          <strong className="font-semibold text-ink">{formatCount(inView.length)} {inView.length === 1 ? 'caso' : 'casos'}</strong> · {props.periodLabel}
        </p>

        <table className="mt-3 w-full border-collapse text-[14px]">
          <caption className="sr-only">Casos por tipo en la vista actual</caption>
          <thead>
            <tr className="border-y border-ink text-left">
              <th scope="col" className="label py-1.5 font-semibold text-ink-3">
                Tipo
              </th>
              <th scope="col" className="label py-1.5 text-right font-semibold text-ink-3">
                Casos
              </th>
              <th scope="col" className="label py-1.5 pl-3 text-right font-semibold text-ink-3">
                Tasa ×100.000
              </th>
            </tr>
          </thead>
          <tbody>
            {INCIDENT_TYPES.map((t) => (
              <tr key={t} className="border-b border-rule-soft last:border-ink">
                <th scope="row" className="py-1.5 text-left font-normal">
                  <span className="flex items-center gap-2">
                    <Mark type={t} size={18} />
                    {TYPE_LABEL[t].many}
                  </span>
                </th>
                <td className="py-1.5 text-right tabular-nums">{formatCount(counts[t])}</td>
                <td className="py-1.5 pl-3 text-right text-ink-3">pendiente</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[12.5px] text-ink-3">
          La tasa por 100.000 habitantes se publicará cuando se incorpore la población por cantón del INEC.
        </p>
      </section>

      <section aria-labelledby="entries-title" className="min-h-0 flex-1">
        <div className="flex items-baseline justify-between gap-3 px-4 pt-4 pb-2 lg:px-5">
          <h2 id="entries-title" className="text-[16px] font-semibold">
            Casos, del más reciente
          </h2>
          {props.zoomedOut && <span className="text-[12.5px] text-ink-3">Acerca el mapa para ver cada marca</span>}
        </div>

        {inView.length === 0 ? (
          <p className="mx-4 mb-4 border border-dashed border-ink px-3 py-4 text-[14px] text-ink-2 lg:mx-5">
            Ningún caso coincide con esta vista y estos filtros. Mueve el mapa, cambia los meses o vuelve a
            activar algún tipo.
          </p>
        ) : (
          <ol className="border-t border-ink">
            {inView.slice(0, shown).map((incident) => (
              <li key={incident.id} className="border-b border-rule-soft">
                <EntryRow
                  incident={incident}
                  active={selected?.id === incident.id}
                  onSelect={() => props.onSelect(incident)}
                />
              </li>
            ))}
          </ol>
        )}
        {inView.length > shown && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-5">
            <p className="text-[13px] text-ink-3">
              Se muestran {formatCount(Math.min(shown, inView.length))} de {formatCount(inView.length)}.
            </p>
            <button
              type="button"
              onClick={() => setShown((n) => n + PAGE)}
              className="border border-ink px-3 py-1 text-[13px] font-medium hover:bg-sello hover:text-paper"
            >
              Mostrar {PAGE} más
            </button>
          </div>
        )}
      </section>

      <aside className="border-t-[3px] border-ink bg-paper-deep px-4 py-3 text-[13px] text-ink-2 lg:px-5">
        Este mapa muestra casos <strong className="font-semibold text-ink">registrados</strong> por el Ministerio
        del Interior, no todo el delito que ocurre: donde se denuncia menos, parece que pasa menos.{' '}
        <button type="button" onClick={props.onOpenMethodology} className="font-medium text-ink underline">
          Leer la metodología
        </button>
      </aside>
    </div>
  )
}

function EntryRow({ incident, active, onSelect }: { incident: Incident; active: boolean; onSelect: () => void }) {
  const p = incident.properties
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? 'true' : undefined}
      className={`grid w-full grid-cols-[4.5rem_1fr_auto] items-start gap-x-3 px-4 py-2.5 text-left transition-colors duration-150 lg:px-5 ${
        active ? 'bg-sello text-paper' : 'hover:bg-sheet'
      }`}
    >
      <span className={`pt-0.5 text-[12px] font-semibold tabular-nums [font-stretch:75%] ${active ? 'text-paper/80' : 'text-ink-3'}`}>
        N.º {entryNumber(incident.id)}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-[14px] font-semibold">
          <span className={active ? 'rounded-full bg-paper' : ''}>
            <Mark type={p.tipo} confidence={p.confianza} size={16} />
          </span>
          {TYPE_LABEL[p.tipo].one}
        </span>
        <span className={`mt-0.5 block truncate text-[13px] ${active ? 'text-paper/80' : 'text-ink-2'}`}>
          {placeName(p.canton)}, {placeName(p.provincia)}
        </span>
      </span>
      <span className={`pt-0.5 text-right text-[12.5px] tabular-nums ${active ? 'text-paper/80' : 'text-ink-2'}`}>
        {p.fecha ? formatShortDate(p.fecha) : 'sin fecha'}
        {p.hora && <span className="block">{p.hora}</span>}
      </span>
    </button>
  )
}

function EntryDetail({ incident, onClose }: { incident: Incident; onClose: () => void }) {
  const p = incident.properties
  const source = SOURCES[p.fuente]
  const year = p.fecha ? Number(p.fecha.slice(0, 4)) : null
  const recent = year === new Date().getFullYear()
  const [lng, lat] = incident.geometry.coordinates

  return (
    <article
      key={incident.id}
      aria-labelledby="detail-title"
      className="ink-in border-b-[3px] border-ink bg-sheet px-4 pt-4 pb-5 lg:px-5"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="detail-title" className="nameplate text-[30px]">
          Caso N.º {entryNumber(incident.id)}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="mt-1 shrink-0 border border-ink px-2 py-0.5 text-[13px] hover:bg-sello hover:text-paper"
        >
          Cerrar
        </button>
      </div>

      <p className="mt-3 flex items-center gap-2 text-[17px] font-semibold">
        <Mark type={p.tipo} confidence={p.confianza} size={22} />
        {TYPE_LABEL[p.tipo].one}
      </p>
      <p className="mt-1 text-[14px] text-ink-2">
        {p.fecha ? formatLongDate(p.fecha) : 'Fecha no registrada'}
        {p.hora && ` · ${p.hora}`} · {placeName(p.canton)}, {placeName(p.provincia)}
      </p>

      <h3 className="label mt-4 border-b border-ink pb-1 text-ink-3">Procedencia</h3>
      <dl className="grid grid-cols-[7.5rem_1fr] gap-x-3 text-[13.5px] [&>dd]:border-b [&>dd]:border-rule-soft [&>dd]:py-1.5 [&>dt]:border-b [&>dt]:border-rule-soft [&>dt]:py-1.5 [&>dt]:text-ink-3">
        <dt>Fuente</dt>
        <dd>{source.name}</dd>
        <dt>Conjunto</dt>
        <dd>
          <a href={source.url} target="_blank" rel="noreferrer" className="underline hover:no-underline">
            {source.dataset}
          </a>
        </dd>
        <dt>Registro original</dt>
        <dd>Fila {Number(entryNumber(incident.id))} del archivo enero–agosto 2026</dd>
        <dt>Actualizado</dt>
        <dd>{formatLongDate(source.updated)}</dd>
        <dt>Confianza</dt>
        <dd>
          <ConfidenceChip confidence={p.confianza} />
          <span className="block text-ink-3">{CONFIDENCE[p.confianza].meaning}</span>
        </dd>
        <dt>Vigencia</dt>
        <dd>{year ? `${recent ? 'Reciente' : 'Histórico'} · ${year}` : 'Sin fecha'}</dd>
        <dt>Ubicación</dt>
        <dd className="tabular-nums">
          Coordenada publicada por la fuente
          <span className="block text-ink-3">
            {lat.toFixed(4)}, {lng.toFixed(4)}
          </span>
        </dd>
      </dl>
      <p className="mt-3 text-[12.5px] text-ink-3">
        ReporteEC no publica datos de las personas involucradas.
      </p>
    </article>
  )
}

function LoadingState() {
  return (
    <div className="px-4 py-5 lg:px-5" aria-busy="true" aria-live="polite">
      <p className="text-[14px] text-ink-2">Cargando el registro…</p>
      <div className="mt-4 space-y-3" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="hatch h-10 border border-rule-soft" />
        ))}
      </div>
    </div>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="px-4 py-5 lg:px-5" role="alert">
      <p className="text-[15px] font-semibold">No se pudo cargar el registro.</p>
      <p className="mt-1 text-[14px] text-ink-2">Revisa tu conexión e inténtalo otra vez.</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 border border-ink px-3 py-1.5 text-[14px] font-medium hover:bg-sello hover:text-paper"
      >
        Reintentar
      </button>
    </div>
  )
}
