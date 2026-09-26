import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Mark } from './Mark'
import type { StatsRow, TimeseriesPoint } from '../lib/api'
import { getCantonIndicators, getCantonIndicatorsSummary, getStats, getStatsTimeseries } from '../lib/api'
import { indicatorRowsToStatsRows, yearTotalsToStatsRows } from '../lib/cantonChoropleth'
import { MONTHS, TYPE_LABEL, type Filters, formatCount, placeName } from '../lib/registry'
import {
  type SortDirection,
  type StatsSortColumn,
  buildLinePath,
  buildMonthlySeries,
  formatRate,
  linearScale,
  rankByRate,
  sortStatsRows,
} from '../lib/stats'

interface EstadisticasProps {
  filters: Filters
  /** "Ecuador" / "la provincia" / "el cantón" -- the area the rates below use. */
  rateAreaLabel: string
}

interface StatsBundle {
  byType: StatsRow[]
  byPlace: StatsRow[]
  cantonRanking: StatsRow[]
  timeseries: TimeseriesPoint[]
  detentionsByYear: StatsRow[]
  detentionsByProvince: StatsRow[]
  extorsionByYear: StatsRow[]
  extorsionRanking: StatsRow[]
  siniestrosByYear: StatsRow[]
  siniestrosRanking: StatsRow[]
}

/**
 * The Estadísticas tab: a full-width page (see App.tsx, which hides the map
 * and keeps only the filter strip and time rule above it while this tab is
 * active). A monthly time series, a nationwide canton ranking, and sortable
 * tables by type and by province/canton, all driven by the SAME filters
 * (year, months, types, province, canton) as the map and registry -- this
 * page has no filter controls of its own. Detentions get a clearly separate
 * section: police activity, never folded into incident totals.
 */
export function Estadisticas({ filters, rateAreaLabel }: EstadisticasProps) {
  const [data, setData] = useState<StatsBundle | null>(null)
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading')

  const geoDimension = filters.province ? 'canton' : 'province'

  useEffect(() => {
    const controller = new AbortController()
    const place = { province: filters.province, canton: filters.canton }

    Promise.all([
      getStats(
        { dimension: 'type', year: filters.year, months: filters.months, ...place },
        controller.signal,
      ),
      getStats(
        {
          dimension: geoDimension,
          year: filters.year,
          months: filters.months,
          types: filters.types,
          ...place,
        },
        controller.signal,
      ),
      // Always nationwide, regardless of the current province/canton filter:
      // a ranking compares places against each other, so narrowing it to the
      // selected place would leave nothing to rank.
      getStats(
        { dimension: 'canton', year: filters.year, months: filters.months, types: filters.types },
        controller.signal,
      ),
      getStatsTimeseries(
        { year: filters.year, months: filters.months, types: filters.types, ...place },
        controller.signal,
      ),
      getStats(
        { dimension: 'year', layer: 'detentions', months: filters.months, ...place },
        controller.signal,
      ),
      getStats(
        { dimension: 'province', layer: 'detentions', year: filters.year, months: filters.months },
        controller.signal,
      ),
      // Extortion (OECO/FGE) and traffic crashes (INEC): reported/denounced
      // cases, never folded into the incident totals above -- own year
      // totals and their own nationwide top-15-by-rate ranking, always for
      // the currently selected year regardless of the map's province/canton
      // filter (a ranking compares places against each other).
      getCantonIndicatorsSummary('extorsion', controller.signal),
      getCantonIndicators('extorsion', filters.year, controller.signal),
      getCantonIndicatorsSummary('siniestros', controller.signal),
      getCantonIndicators('siniestros', filters.year, controller.signal),
    ])
      .then(
        ([
          byType,
          byPlace,
          cantonRanking,
          timeseries,
          detentionsByYear,
          detentionsByProvince,
          extorsionByYear,
          extorsionRanking,
          siniestrosByYear,
          siniestrosRanking,
        ]) => {
          setData({
            byType: byType.rows,
            byPlace: byPlace.rows,
            cantonRanking: cantonRanking.rows,
            timeseries: timeseries.points,
            detentionsByYear: detentionsByYear.rows,
            detentionsByProvince: detentionsByProvince.rows,
            extorsionByYear: yearTotalsToStatsRows(extorsionByYear.years),
            extorsionRanking: indicatorRowsToStatsRows(extorsionRanking.rows),
            siniestrosByYear: yearTotalsToStatsRows(siniestrosByYear.years),
            siniestrosRanking: indicatorRowsToStatsRows(siniestrosRanking.rows),
          })
          setStatus('ready')
        },
      )
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          console.error(error)
          setStatus('error')
        }
      })

    return () => controller.abort()
  }, [filters, geoDimension])

  return (
    <div className="mx-auto max-w-[1400px]">
      <header className="border-b border-ink px-4 py-4 lg:px-6">
        <h2 className="nameplate text-[34px]">Estadísticas</h2>
        <p className="mt-2 max-w-[70ch] text-[14px] text-ink-2">
          Casos y tasas por 100.000 habitantes para {rateAreaLabel}, con los mismos filtros de año, meses,
          tipo y lugar que el mapa.
        </p>
      </header>

      {status === 'loading' && !data && (
        <p className="px-4 py-5 text-[14px] text-ink-2 lg:px-6" aria-live="polite">
          Cargando estadísticas…
        </p>
      )}
      {status === 'error' && (
        <p className="px-4 py-5 text-[14px] text-ink-2 lg:px-6" role="alert">
          No se pudieron cargar las estadísticas. Vuelve a intentarlo más tarde.
        </p>
      )}

      {data && (
        <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-6">
          <div>
            <Section title="Casos por mes">
              <MonthlyChart points={data.timeseries} months={filters.months} year={filters.year} />
            </Section>

            <Section title="Por tipo">
              <RateTable
                caption="Casos y tasa por tipo de incidente (tasa = casos por 100.000 habitantes)"
                keyHeader="Tipo"
                rows={data.byType}
                defaultSort="count"
                renderKey={(row) => (
                  <span className="flex items-center gap-2">
                    <Mark type={row.key as keyof typeof TYPE_LABEL} size={16} />
                    {TYPE_LABEL[row.key as keyof typeof TYPE_LABEL]?.one ?? row.label}
                  </span>
                )}
              />
            </Section>

            <Section title={filters.province ? 'Por cantón' : 'Por provincia'}>
              <RateTable
                caption={
                  (filters.province
                    ? 'Casos y tasa por cantón, dentro de la provincia elegida'
                    : 'Casos y tasa por provincia') + ' (tasa = casos por 100.000 habitantes)'
                }
                keyHeader={filters.province ? 'Cantón' : 'Provincia'}
                rows={data.byPlace}
                defaultSort="count"
              />
            </Section>
          </div>

          <div>
            <Section title="Cantones con mayor tasa (top 15, todo el país)">
              <RateTable
                caption="Los 15 cantones con mayor tasa por 100.000 habitantes, en todo el país (tasa = casos por 100.000 habitantes)"
                keyHeader="Cantón"
                rows={rankByRate(data.cantonRanking, 15)}
                defaultSort="rate_per_100k"
              />
            </Section>

            <Section title="Actividad policial (no es inseguridad)">
              <p className="text-[13.5px] text-ink-2">
                Detenciones y aprehensiones: son acciones de la Policía, no hechos de inseguridad. Nunca
                se suman a los casos de arriba.
              </p>
              <h4 className="label mt-3 text-ink-3">Por año</h4>
              <RateTable
                caption="Detenciones y tasa por año (tasa = casos por 100.000 habitantes)"
                keyHeader="Año"
                rows={data.detentionsByYear}
                defaultSort="label"
                defaultDirection="asc"
              />
              <h4 className="label mt-4 text-ink-3">Por provincia</h4>
              <RateTable
                caption="Detenciones y tasa por provincia (tasa = casos por 100.000 habitantes)"
                keyHeader="Provincia"
                rows={data.detentionsByProvince}
                defaultSort="count"
              />
            </Section>

            <Section title="Extorsión (denuncias, OECO/FGE)">
              <p className="text-[13.5px] text-ink-2">
                Denuncias de extorsión registradas por la Fiscalía y el Observatorio Ecuatoriano de Crimen
                Organizado, no una medición total del delito: donde se denuncia menos, la cifra parece más baja
                de lo que es.
              </p>
              <h4 className="label mt-3 text-ink-3">Por año</h4>
              <RateTable
                caption="Denuncias de extorsión y tasa por año (tasa = casos por 100.000 habitantes)"
                keyHeader="Año"
                rows={data.extorsionByYear}
                defaultSort="label"
                defaultDirection="asc"
              />
              <h4 className="label mt-4 text-ink-3">Cantones con mayor tasa (top 15, {filters.year})</h4>
              <RateTable
                caption="Los 15 cantones con mayor tasa de extorsión por 100.000 habitantes (tasa = casos por 100.000 habitantes)"
                keyHeader="Cantón"
                rows={rankByRate(data.extorsionRanking, 15)}
                defaultSort="rate_per_100k"
              />
            </Section>

            <Section title="Siniestros de tránsito (INEC)">
              <p className="text-[13.5px] text-ink-2">
                Siniestros de tránsito reportados por el INEC (ESTRA), no una medición total de la
                accidentalidad vial.
              </p>
              <h4 className="label mt-3 text-ink-3">Por año</h4>
              <RateTable
                caption="Siniestros de tránsito y tasa por año (tasa = casos por 100.000 habitantes)"
                keyHeader="Año"
                rows={data.siniestrosByYear}
                defaultSort="label"
                defaultDirection="asc"
              />
              <h4 className="label mt-4 text-ink-3">Cantones con mayor tasa (top 15, {filters.year})</h4>
              <RateTable
                caption="Los 15 cantones con mayor tasa de siniestros de tránsito por 100.000 habitantes (tasa = casos por 100.000 habitantes)"
                keyHeader="Cantón"
                rows={rankByRate(data.siniestrosRanking, 15)}
                defaultSort="rate_per_100k"
              />
            </Section>
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-rule-soft px-4 pt-5 pb-5 last:border-b-0 lg:px-6">
      <h3 className="text-[16px] leading-snug font-semibold">{title}</h3>
      <div className="mt-2 text-[14px] text-ink-2">{children}</div>
    </section>
  )
}

function MonthlyChart({
  points,
  months,
  year,
}: {
  points: TimeseriesPoint[]
  months: number[]
  year: number
}) {
  const series = buildMonthlySeries(points, months)

  if (series.length < 2) {
    return <p className="text-[13.5px] text-ink-3">Elige más de un mes para ver la tendencia mensual.</p>
  }

  const counts = series.map((point) => point.count)
  const maxCount = Math.max(1, ...counts)

  const width = 360
  const height = 140
  const padding = { top: 10, bottom: 10 }
  // Each month sits at the centre of its table column below, so the line and
  // the labels line up at any container width.
  const columnX = (index: number) => ((index + 0.5) / series.length) * width
  const yScale = linearScale([0, maxCount], [height - padding.bottom, padding.top])
  const path = buildLinePath(series.map((point, index) => ({ x: columnX(index), y: yScale(point.count) })))

  return (
    <div>
      {/* The SVG stretches to the container (preserveAspectRatio none) so its
          columns match the table's; non-scaling strokes keep the line crisp. */}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Casos por mes en ${year}. La tabla debajo muestra los mismos valores.`}
        className="h-32 w-full max-w-full"
      >
        <line
          x1={0}
          y1={height - padding.bottom}
          x2={width}
          y2={height - padding.bottom}
          stroke="var(--color-rule-soft)"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={path}
          fill="none"
          stroke="var(--color-sello)"
          strokeWidth={2}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {/* Text alternative for the chart above: exactly the same months, in
          the same order -- never the full calendar year, only the ones
          actually selected (see buildMonthlySeries). overflow-x-auto is a
          safety net, not the expected case, now that this only ever holds
          as many columns as there are selected months. */}
      <div className="mt-2 overflow-x-auto">
        <table className="w-full table-fixed border-collapse text-[12.5px]">
          <caption className="sr-only">
            Casos por mes, {year}: la misma información que el gráfico, en tabla.
          </caption>
          <thead>
            <tr className="border-y border-ink">
              {series.map((point) => (
                <th
                  key={point.month}
                  scope="col"
                  className="label py-1 text-center font-semibold text-ink-3"
                >
                  {MONTHS[point.month - 1]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {series.map((point) => (
                <td key={point.month} className="py-1 text-center tabular-nums">
                  {formatCount(point.count)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

interface RateTableProps {
  caption: string
  keyHeader: string
  rows: StatsRow[]
  defaultSort?: StatsSortColumn
  defaultDirection?: SortDirection
  renderKey?: (row: StatsRow) => ReactNode
}

function RateTable({
  caption,
  keyHeader,
  rows,
  defaultSort = 'count',
  defaultDirection = 'desc',
  renderKey,
}: RateTableProps) {
  const [sortColumn, setSortColumn] = useState<StatsSortColumn>(defaultSort)
  const [direction, setDirection] = useState<SortDirection>(defaultDirection)
  const sorted = useMemo(
    () => sortStatsRows(rows, sortColumn, direction),
    [rows, sortColumn, direction],
  )

  function toggle(column: StatsSortColumn) {
    if (column === sortColumn) {
      setDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortColumn(column)
      setDirection('desc')
    }
  }

  function headerCell(column: StatsSortColumn, label: string, align: 'left' | 'right') {
    const active = column === sortColumn
    return (
      <th
        scope="col"
        className={`label py-1.5 font-semibold text-ink-3 ${align === 'right' ? 'text-right' : 'text-left'}`}
        aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        <button
          type="button"
          onClick={() => toggle(column)}
          className={`inline-flex items-center gap-1 hover:text-ink ${active ? 'text-ink' : ''}`}
        >
          {label}
          {active && <span aria-hidden="true">{direction === 'asc' ? '▲' : '▼'}</span>}
        </button>
      </th>
    )
  }

  return (
    // overflow-x-auto is a fallback only: table-fixed + percentage column
    // widths below make every column, including the rate, fit any container
    // width without being clipped -- unlike a plain auto-layout table, whose
    // last column can be squeezed to nothing by a long place name.
    <div className="overflow-x-auto">
      <table className="w-full table-fixed border-collapse text-[13.5px]">
        <caption className="sr-only">{caption}</caption>
        <colgroup>
          <col className="w-[40%]" />
          <col className="w-[18%]" />
          <col className="w-[20%]" />
          <col className="w-[22%]" />
        </colgroup>
        <thead>
          <tr className="border-y border-ink">
            {headerCell('label', keyHeader, 'left')}
            {headerCell('count', 'Casos', 'right')}
            {headerCell('population', 'Población', 'right')}
            {headerCell('rate_per_100k', 'Tasa', 'right')}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr>
              <td colSpan={4} className="py-3 text-center text-ink-3">
                Sin datos para estos filtros.
              </td>
            </tr>
          )}
          {sorted.map((row) => (
            <tr key={row.key} className="border-b border-rule-soft last:border-ink">
              <th scope="row" className="py-1.5 pr-2 text-left font-normal break-words">
                {renderKey ? renderKey(row) : placeName(row.label)}
              </th>
              <td className="py-1.5 text-right whitespace-nowrap tabular-nums">
                {formatCount(row.count)}
              </td>
              <td className="py-1.5 text-right whitespace-nowrap tabular-nums text-ink-3">
                {formatCount(row.population)}
              </td>
              <td className="py-1.5 text-right whitespace-nowrap tabular-nums">
                {formatRate(row.rate_per_100k)}
                {row.low_population_warning && (
                  <span title="Población menor a 10.000 habitantes: la tasa es poco estable"> ⚠</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
