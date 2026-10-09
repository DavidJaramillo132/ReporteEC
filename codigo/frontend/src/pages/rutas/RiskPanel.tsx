import { ColumnChart } from '../../components/charts/ColumnChart'
import type { RouteRiskResponse } from '../../lib/api'
import { SELLO, SELLO_LIGHT } from '../../lib/charts'
import { formatCount, formatLongDate } from '../../lib/registry'
import {
  BANDS,
  ROUTE_NOTES,
  type BandInfo,
  bandForHour,
  blackspotParts,
  formatCasesPerKm,
  formatDistance,
  formatDuration,
  hourLabel,
  hourlyColumns,
  riskForHour,
  scoreAvailable,
} from '../../lib/routeRisk'
import { Link } from '../../lib/router'
import { BandIcon } from './BandIcon'
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
  const withScore = scoreAvailable(data)
  const band = withScore ? bandForHour(risk) : null
  const columns = hourlyColumns(data.hourly, hour, withScore)
  const bestHour = data.best_hour

  return (
    <div className="space-y-5">
      {band && risk.score !== null ? (
        <SemaforoReading band={band} score={risk.score} hour={hour} />
      ) : (
        <div className="border border-ink bg-sheet p-4">
          <p className="text-[17px] font-semibold">Puntaje no disponible todavía</p>
          <p className="mt-1 text-[13.5px] text-ink-2">
            Aún no está calculada la referencia que convierte los casos en un puntaje de 0 a 100. Mientras tanto, el
            gráfico muestra a qué hora del día se registraron los casos cerca de esta ruta.
          </p>
        </div>
      )}

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
          <dt className="label text-ink-3">Mejor hora para salir</dt>
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
            <dd className="mt-0.5 text-[13.5px] text-ink-2">Sin casos registrados cerca de la ruta.</dd>
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
        title={withScore ? 'Puntaje según la hora de salida' : 'Casos cerca de la ruta según la hora del día'}
        subtitle={
          withScore
            ? 'De 0 a 100 para cada hora de salida, según los casos por kilómetro, de 00:00 a 23:00 (hora de Ecuador).'
            : 'Porcentaje de los casos registrados cerca de la ruta en cada hora del día (hora de Ecuador).'
        }
        data={columns.map((c) => ({
          key: c.key,
          label: c.label,
          value: c.value,
          valueLabel: c.valueLabel,
          detail: c.detail,
          color: c.selected ? SELLO : SELLO_LIGHT,
        }))}
        valueHeader={withScore ? 'Puntaje' : '% de los casos'}
        detailHeader={withScore ? 'Nivel' : undefined}
        categoryHeader={withScore ? 'Hora de salida' : 'Hora del día'}
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

/** The band for the chosen hour: shape + label + score, and where the score sits on the 0-100 scale. */
function SemaforoReading({ band, score, hour }: { band: BandInfo; score: number; hour: number }) {
  return (
    <div
      className="border border-ink bg-sheet p-4"
      role="group"
      aria-label={`Nivel para salir a las ${hourLabel(hour)}: ${band.label}, ${score} de 100`}
    >
      <p className="label text-ink-3">Saliendo a las {hourLabel(hour)}</p>
      <div className="mt-2 flex items-center gap-3">
        <BandIcon shape={band.shape} color={band.color} size={36} />
        {/* A large figure at normal width, like Estadísticas' Resumen: the condensed axis is for the nameplate and labels only. */}
        <p className="text-[30px] leading-none font-semibold">{band.label}</p>
        <p className="ml-auto text-right">
          <span className="text-[26px] font-semibold tabular-nums">{score}</span>
          <span className="text-[13px] text-ink-2"> de 100</span>
        </p>
      </div>
      <div className="mt-3" aria-hidden="true">
        <div className="relative flex h-2.5 gap-0.5">
          {BANDS.map((b) => (
            <span
              key={b.key}
              className={b.key === band.key ? '' : 'hatch'}
              style={{ flex: b.max - b.min + 1, background: b.key === band.key ? b.color : undefined }}
            />
          ))}
          <span className="absolute -top-1 h-[18px] w-0.5 bg-ink" style={{ left: `calc(${score}% - 1px)` }} />
        </div>
        <div className="mt-1 flex text-[11.5px] text-ink-3">
          {BANDS.map((b) => (
            <span key={b.key} className={`truncate ${b.key === band.key ? 'font-semibold text-ink' : ''}`} style={{ flex: b.max - b.min + 1 }}>
              {b.label}
            </span>
          ))}
        </div>
      </div>
      <p className="mt-2 text-[13px] text-ink-2">
        Compara cuántos casos hay por kilómetro de esta ruta, a esta hora, con cientos de rutas entre cantones, a todas
        las horas.
      </p>
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
