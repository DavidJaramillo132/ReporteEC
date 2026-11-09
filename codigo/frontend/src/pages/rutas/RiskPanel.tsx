import { ColumnChart } from '../../components/charts/ColumnChart'
import type { RouteRiskResponse } from '../../lib/api'
import { SELLO, SELLO_LIGHT } from '../../lib/charts'
import { formatCount, formatLongDate } from '../../lib/registry'
import {
  ROUTE_NOTES,
  blackspotParts,
  formatCasesPerKm,
  formatDistance,
  formatDuration,
  hourLabel,
  riskForHour,
} from '../../lib/routeRisk'
import { Link } from '../../lib/router'
import { BlackspotNumber } from './EndpointMark'

interface RiskPanelProps {
  data: RouteRiskResponse
  hour: number
  onHour: (hour: number) => void
  onFocusBlackspot: (index: number) => void
}

/** The result for one route: semáforo, figures, notices, the 24-hour chart, blackspots and the honesty note. */
export function RiskPanel({ data, hour, onHour, onFocusBlackspot }: RiskPanelProps) {
  const risk = riskForHour(data, hour)
  const exposure = risk.exposure
  const columns = data.hourly.map((h) => ({
    key: String(h.hour), label: hourLabel(h.hour), value: h.exposure?.value ?? 0,
    valueLabel: new Intl.NumberFormat('es-EC', { maximumFractionDigits: 2 }).format(h.exposure?.value ?? 0),
    detail: h.exposure?.level_label ?? 'Nivel aún no disponible', selected: h.hour === hour,
  }))
  const bestHour = data.best_hour

  return (
    <div className="space-y-5">
      <div className="border border-ink bg-sheet p-4" role="group" aria-label={`Exposición al salir a las ${hourLabel(hour)}`}>
        <p className="label text-ink-3">Saliendo a las {hourLabel(hour)}</p>
        <p className="mt-2 text-[24px] font-semibold leading-tight">
          {exposure?.level_label ?? 'Nivel aún no disponible'}
        </p>
        <p className="mt-2 text-[13.5px] text-ink-2">
          Acumula la concentración histórica cercana a cada tramo según los minutos que pasas en él.
          No es una probabilidad de sufrir un delito.
        </p>
        <p className="mt-2 text-[12px] text-ink-3">
          {exposure?.level_available
            ? 'Nivel relativo a una referencia nacional de viajes urbanos e interurbanos.'
            : 'La referencia nacional del nuevo cálculo todavía no está calibrada. El gráfico muestra el índice de exposición.'}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-y border-ink py-3 text-[14px]">
        <Fact term="Distancia" value={formatDistance(data.distance_km)} />
        <Fact term="Duración en auto" value={formatDuration(data.duration_min)} />
        <Fact
          term="Casos cerca de la ruta"
          value={formatCount(data.cases.total)}
          note={data.data_cut ? `2019 a ${formatLongDate(data.data_cut)}` : undefined}
        />
        <Fact
          term="Casos por km (ponderados por antigüedad)"
          value={formatCasesPerKm(data.cases_per_km)}
          note="Un caso de hace un año cuenta la mitad."
        />
        <div className="col-span-2 min-w-0">
          <dt className="label text-ink-3">Hora con menor exposición estimada</dt>
          {bestHour !== null ? (
            <dd className="mt-0.5">
              <span className="text-[20px] font-semibold tabular-nums">{hourLabel(bestHour)}</span>
              {bestHour !== hour && (
                <button
                  type="button"
                  onClick={() => onHour(bestHour)}
                  className="ml-2 text-[12.5px] font-semibold text-ink-2 underline decoration-ink-3 underline-offset-2 hover:text-sello"
                >
                  Ver esa hora
                </button>
              )}
            </dd>
          ) : (
            <dd className="mt-0.5 text-[13.5px] text-ink-2">No hay evidencia horaria suficiente para recomendar una hora.</dd>
          )}
        </div>
      </dl>

      {data.low_data && (
        <p className="border border-ink-3 bg-paper-deep px-3 py-2 text-[13.5px] text-ink-2">
          <strong className="font-semibold text-ink">Pocos casos cerca de esta ruta.</strong> La curva por hora se apoya
          sobre todo en el patrón de todo el país, así que tómala como una referencia general.
        </p>
      )}

      <ColumnChart
        title="Exposición histórica según la hora de salida"
        subtitle="Intensidad histórica × minutos de recorrido, de 00:00 a 23:00 (hora de Ecuador). Un índice menor indica menor exposición estimada."
        data={columns.map((c) => ({
          key: c.key,
          label: c.label,
          value: c.value,
          valueLabel: c.valueLabel,
          detail: c.detail,
          color: c.selected ? SELLO : SELLO_LIGHT,
        }))}
        valueHeader="Índice de exposición"
        detailHeader="Nivel"
        categoryHeader="Hora de salida"
        legend={[
          { key: 'elegida', label: `Hora elegida (${hourLabel(hour)})`, color: SELLO },
          { key: 'otras', label: 'Otras horas', color: SELLO_LIGHT },
        ]}
        height={180}
      />

      <section aria-labelledby="tramos-title">
        <h3 id="tramos-title" className="label text-ink-3">
          Tramos con más casos
        </h3>
        {data.blackspots.length === 0 ? (
          <p className="mt-1.5 text-[13.5px] text-ink-2">
            {data.cases.total === 0
              ? 'No hay casos registrados cerca de esta ruta.'
              : 'Ningún tramo de 1 km concentra casos de forma marcada en esta ruta.'}
          </p>
        ) : (
          <ol className="mt-2 divide-y divide-rule-soft border-y border-ink">
            {data.blackspots.map((spot, i) => (
              <li key={`${spot.km_from}-${i}`}>
                <button
                  type="button"
                  onClick={() => onFocusBlackspot(i)}
                  className="flex w-full items-start gap-2.5 px-1 py-2 text-left text-[13.5px] hover:bg-paper-deep"
                >
                  <BlackspotNumber n={i + 1} />
                  <span className="min-w-0 flex-1">
                    <span className="block">
                      {blackspotParts(spot).map((part, k) => (
                        <span key={k}>
                          {k > 0 && ' · '}
                          {/* Short parts (km, years) never break inside; long ones wrap normally. */}
                          <span className={part.length <= 16 ? 'whitespace-nowrap' : undefined}>{part}</span>
                        </span>
                      ))}
                    </span>
                    <span className="block text-[12px] text-ink-3">Ver en el mapa</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>

      <HonestyNote notes={data.notes.length ? data.notes : ROUTE_NOTES} />
    </div>
  )
}

function Fact({ term, value, note }: { term: string; value: string; note?: string }) {
  return (
    <div className="min-w-0">
      <dt className="label text-ink-3">{term}</dt>
      <dd className="mt-0.5">
        <span className="text-[20px] font-semibold tabular-nums">{value}</span>
        {note && <span className="block text-[12px] text-ink-3">{note}</span>}
      </dd>
    </div>
  )
}

/** The required limits of the score (Global Constraints), always shown with the result. */
export function HonestyNote({ notes = ROUTE_NOTES }: { notes?: string[] }) {
  return (
    <aside aria-labelledby="que-mide-title" className="border-t border-ink pt-3 text-[13px] text-ink-2">
      <h3 id="que-mide-title" className="label text-ink-3">
        Qué mide y qué no
      </h3>
      <ul className="mt-1.5 list-disc space-y-1 pl-4">
        {notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
      <Link to="/metodologia#riesgo-en-rutas" className="mt-2 inline-block font-semibold text-ink underline decoration-ink-3 underline-offset-2 hover:text-sello">
        Cómo se calcula
      </Link>
    </aside>
  )
}
