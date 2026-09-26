import { ConfidenceChip, Mark } from './Mark'
import type { IncidentDetail, IncidentListItem, StatsRow } from '../lib/api'
import {
  CONFIDENCE,
  INCIDENT_TYPES,
  TYPE_LABEL,
  entryNumber,
  formatCount,
  formatLongDate,
  formatShortDate,
  placeName,
} from '../lib/registry'
import { formatRate } from '../lib/stats'

interface RegistryColumnProps {
  status: 'loading' | 'error' | 'ready'
  items: IncidentListItem[]
  total: number
  countsByType: Record<string, number>
  /** dimension=type rows from /api/stats, for the "Tasa ×100.000" column. */
  typeStats: StatsRow[]
  /** Names the population scope the rates above use: "Ecuador", "la provincia" or "el cantón". */
  rateAreaLabel: string
  hasMore: boolean
  onLoadMore: () => void
  periodLabel: string
  zoomedOut: boolean
  selectedId: number | null
  selected: IncidentDetail | null
  lastUpdatedAt: string | null
  /** Best-effort: the browser reports no connection right now (see App.tsx). */
  offline: boolean
  onSelect: (item: IncidentListItem) => void
  onCloseDetail: () => void
  onRetry: () => void
  onOpenMethodology: () => void
}

export function RegistryColumn(props: RegistryColumnProps) {
  const { status, items, total, countsByType, typeStats, selectedId, selected } = props
  const rateByType = Object.fromEntries(typeStats.map((row) => [row.key, row]))

  // A full skeleton/error state only replaces the column before anything has
  // ever loaded; a later refetch (pan, filter change) keeps showing the last
  // good page instead of flashing the whole column empty.
  if (status === 'loading' && items.length === 0) return <LoadingState />
  if (status === 'error' && items.length === 0) return <ErrorState onRetry={props.onRetry} offline={props.offline} />

  return (
    <div className="flex min-h-0 flex-col">
      {selected && (
        <EntryDetail incident={selected} lastUpdatedAt={props.lastUpdatedAt} onClose={props.onCloseDetail} />
      )}

      <section aria-labelledby="summary-title" className="border-b border-ink px-4 py-4 lg:px-5">
        <h2 id="summary-title" className="text-[19px] leading-tight font-semibold">
          Registro de la vista actual
        </h2>
        <p className="mt-1 text-[14px] text-ink-2" aria-live="polite">
          <strong className="font-semibold text-ink">
            {formatCount(total)} {total === 1 ? 'caso' : 'casos'}
          </strong>{' '}
          · {props.periodLabel}
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
                <span className="block normal-case"> {props.rateAreaLabel}</span>
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
                <td className="py-1.5 text-right tabular-nums">{formatCount(countsByType[t] ?? 0)}</td>
                <td className="py-1.5 pl-3 text-right tabular-nums">
                  {formatRate(rateByType[t]?.rate_per_100k ?? null)}
                  {rateByType[t]?.low_population_warning && (
                    <span title="Población menor a 10.000 habitantes: la tasa es poco estable">
                      {' '}
                      ⚠
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="entries-title" className="min-h-0 flex-1">
        <div className="flex items-baseline justify-between gap-3 px-4 pt-4 pb-2 lg:px-5">
          <h2 id="entries-title" className="text-[16px] font-semibold">
            Casos, del más reciente
          </h2>
          {props.zoomedOut && <span className="text-[12.5px] text-ink-3">Acerca el mapa para ver cada marca</span>}
        </div>

        {items.length === 0 ? (
          <p className="mx-4 mb-4 border border-dashed border-ink px-3 py-4 text-[14px] text-ink-2 lg:mx-5">
            Ningún caso coincide con esta vista y estos filtros. Mueve el mapa, cambia los meses o vuelve a
            activar algún tipo.
          </p>
        ) : (
          <ol className="border-t border-ink">
            {items.map((item) => (
              <li key={item.id} className="border-b border-rule-soft">
                <EntryRow item={item} active={selectedId === item.id} onSelect={() => props.onSelect(item)} />
              </li>
            ))}
          </ol>
        )}
        {props.hasMore && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-5">
            <p className="text-[13px] text-ink-3">
              Se muestran {formatCount(items.length)} de {formatCount(total)}.
            </p>
            <button
              type="button"
              onClick={props.onLoadMore}
              className="border border-ink px-3 py-1 text-[13px] font-medium hover:bg-sello hover:text-paper"
            >
              Mostrar 40 más
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

function EntryRow({ item, active, onSelect }: { item: IncidentListItem; active: boolean; onSelect: () => void }) {
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
        N.º {entryNumber(item.id)}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-[14px] font-semibold">
          <span className={active ? 'rounded-full bg-paper' : ''}>
            <Mark type={item.type} confidence={item.confidence} size={16} />
          </span>
          {TYPE_LABEL[item.type].one}
        </span>
        <span className={`mt-0.5 block truncate text-[13px] ${active ? 'text-paper/80' : 'text-ink-2'}`}>
          {item.canton_name ? placeName(item.canton_name) : 'Cantón sin registrar'},{' '}
          {item.province_name ? placeName(item.province_name) : 'Provincia sin registrar'}
        </span>
      </span>
      <span className={`pt-0.5 text-right text-[12.5px] tabular-nums ${active ? 'text-paper/80' : 'text-ink-2'}`}>
        {formatShortDate(item.date)}
        <span className="block">{item.time}</span>
      </span>
    </button>
  )
}

function EntryDetail({
  incident,
  lastUpdatedAt,
  onClose,
}: {
  incident: IncidentDetail
  lastUpdatedAt: string | null
  onClose: () => void
}) {
  const year = Number(incident.date.slice(0, 4))
  const recent = year === new Date().getFullYear()

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
        <Mark type={incident.type} confidence={incident.confidence} size={22} />
        {TYPE_LABEL[incident.type].one}
      </p>
      <p className="mt-1 text-[14px] text-ink-2">
        {formatLongDate(incident.date)} · {incident.time} ·{' '}
        {incident.canton_name ? placeName(incident.canton_name) : 'Cantón sin registrar'},{' '}
        {incident.province_name ? placeName(incident.province_name) : 'Provincia sin registrar'}
      </p>

      <h3 className="label mt-4 border-b border-ink pb-1 text-ink-3">Procedencia</h3>
      <dl className="grid grid-cols-[7.5rem_1fr] gap-x-3 text-[13.5px] [&>dd]:border-b [&>dd]:border-rule-soft [&>dd]:py-1.5 [&>dt]:border-b [&>dt]:border-rule-soft [&>dt]:py-1.5 [&>dt]:text-ink-3">
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
        <dd>{`${recent ? 'Reciente' : 'Histórico'} · ${year}`}</dd>
        <dt>Ubicación</dt>
        <dd className="tabular-nums">
          Coordenada publicada por la fuente
          <span className="block text-ink-3">
            {incident.lat.toFixed(4)}, {incident.lon.toFixed(4)}
          </span>
        </dd>
      </dl>
      <p className="mt-3 text-[12.5px] text-ink-3">ReporteEC no publica datos de las personas involucradas.</p>
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

function ErrorState({ onRetry, offline }: { onRetry: () => void; offline: boolean }) {
  return (
    <div className="px-4 py-5 lg:px-5" role="alert">
      <p className="text-[15px] font-semibold">{offline ? 'Sin conexión' : 'No se pudo cargar el registro.'}</p>
      <p className="mt-1 text-[14px] text-ink-2">
        {offline
          ? 'Se muestran los últimos datos guardados cuando existen. Revisa tu conexión e inténtalo otra vez.'
          : 'Revisa tu conexión e inténtalo otra vez.'}
      </p>
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
