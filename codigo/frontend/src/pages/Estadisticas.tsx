import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { FilterStrip } from '../components/FilterStrip'
import { Mark } from '../components/Mark'
import { TimeRule } from '../components/TimeRule'
import type { AdminUnitsResponse, MetaResponse, StatsRow, TimeseriesPoint } from '../lib/api'
import { getCantonIndicators, getCantonIndicatorsSummary, getStats, getStatsTimeseries } from '../lib/api'
import { indicatorRowsToStatsRows, yearTotalsToStatsRows } from '../lib/cantonChoropleth'
import { FIRST_YEAR, MONTHS, TYPE_LABEL, type Filters, formatCount, placeName } from '../lib/registry'
import { Link } from '../lib/router'
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
  onUpdate: (patch: Partial<Filters>) => void
  onChangeYear: (year: number) => void
  meta: MetaResponse | null
  adminUnits: AdminUnitsResponse | null
  lastMonth: number
}

interface StatsBundle {
  byType: StatsRow[]
  byPlace: StatsRow[]
  cantonRanking: StatsRow[]
  timeseries: TimeseriesPoint[]
  previousPeriodCount: number | null
  detentionsByYear: StatsRow[]
  detentionsByProvince: StatsRow[]
  extorsionByYear: StatsRow[]
  extorsionRanking: StatsRow[]
  siniestrosByYear: StatsRow[]
  siniestrosRanking: StatsRow[]
}

interface IndexEntry {
  id: string
  label: string
}

const INDEX: IndexEntry[] = [
  { id: 'incidentes', label: 'Incidentes' },
  { id: 'territorio', label: 'Territorio' },
  { id: 'extorsion', label: 'Extorsión' },
  { id: 'siniestros', label: 'Siniestros de tránsito' },
  { id: 'actividad-policial', label: 'Actividad policial' },
]

/**
 * The statistics page: `/estadisticas` (see the plan). Same shared filters
 * as the map (synced to the URL by App.tsx), a summary of 3 headline
 * figures, and five sections behind a sticky index -- reusing MonthlyChart,
 * RateTable and lib/stats.ts unchanged, just reordered under the new index.
 */
export function Estadisticas({ filters, onUpdate, onChangeYear, meta, adminUnits, lastMonth }: EstadisticasProps) {
  useEffect(() => {
    document.title = 'Estadísticas · ReporteEC'
  }, [])

  const [data, setData] = useState<StatsBundle | null>(null)
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading')

  const geoDimension = filters.province ? 'canton' : 'province'
  const rateAreaLabel = filters.canton ? 'el cantón' : filters.province ? 'la provincia' : 'Ecuador'

  useEffect(() => {
    const controller = new AbortController()
    const place = { province: filters.province, canton: filters.canton }
    const previousYear = filters.year - 1

    Promise.all([
      getStats({ dimension: 'type', year: filters.year, months: filters.months, ...place }, controller.signal),
      getStats({ dimension: geoDimension, year: filters.year, months: filters.months, types: filters.types, ...place }, controller.signal),
      getStats({ dimension: 'canton', year: filters.year, months: filters.months, types: filters.types }, controller.signal),
      getStatsTimeseries({ year: filters.year, months: filters.months, types: filters.types, ...place }, controller.signal),
      // A cheap comparison against the same months of the previous year --
      // skipped before FIRST_YEAR, when there is nothing to compare against.
      previousYear >= FIRST_YEAR
        ? getStats({ dimension: 'type', year: previousYear, months: filters.months, types: filters.types, ...place }, controller.signal)
        : Promise.resolve(null),
      getStats({ dimension: 'year', layer: 'detentions', months: filters.months, ...place }, controller.signal),
      getStats({ dimension: 'province', layer: 'detentions', year: filters.year, months: filters.months }, controller.signal),
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
          previousPeriod,
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
            previousPeriodCount: previousPeriod ? previousPeriod.rows.reduce((sum, row) => sum + row.count, 0) : null,
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

  const typeCounts = useMemo(() => Object.fromEntries((data?.byType ?? []).map((row) => [row.key, row.count])), [data])
  const totalCount = useMemo(() => data?.byType.reduce((sum, row) => sum + row.count, 0) ?? null, [data])
  const population = data?.byType[0]?.population ?? null
  const lowPopulation = data?.byType[0]?.low_population_warning ?? false
  const overallRate = totalCount !== null && population ? (totalCount / population) * 100000 : null
  const change =
    totalCount !== null && data?.previousPeriodCount ? ((totalCount - data.previousPeriodCount) / data.previousPeriodCount) * 100 : null

  return (
    <div className="flex flex-1 flex-col lg:min-h-0">
      <FilterStrip
        provinces={adminUnits?.provinces ?? []}
        cantons={filters.province ? (adminUnits?.cantons ?? []).filter((c) => c.province_code === filters.province) : []}
        province={filters.province}
        canton={filters.canton}
        types={filters.types}
        typeCounts={typeCounts}
        onProvince={(province) => onUpdate({ province, canton: null })}
        onCanton={(canton) => onUpdate({ canton })}
        onToggleType={(type) =>
          onUpdate({ types: filters.types.includes(type) ? filters.types.filter((t) => t !== type) : [...filters.types, type] })
        }
      />
      <TimeRule
        year={filters.year}
        months={filters.months}
        availableYears={meta?.years ?? []}
        lastMonth={lastMonth}
        onYear={onChangeYear}
        onMonths={(months) => onUpdate({ months })}
      />

      <div className="min-h-0 flex-1 bg-paper lg:overflow-y-auto">
        <div className="mx-auto max-w-[1400px] px-4 py-5 lg:px-6">
          <header>
            <h1 className="nameplate text-[30px]">Estadísticas</h1>
            <p className="mt-1.5 max-w-[70ch] text-[14px] text-ink-2">
              Casos y tasas por 100.000 habitantes para {rateAreaLabel}, con los mismos filtros de año, meses, tipo y lugar que
              el mapa.
            </p>
          </header>

          {status === 'loading' && !data && (
            <p className="mt-4 text-[14px] text-ink-2" aria-live="polite">
              Cargando estadísticas…
            </p>
          )}
          {status === 'error' && (
            <p className="mt-4 text-[14px] text-ink-2" role="alert">
              No se pudieron cargar las estadísticas. Vuelve a intentarlo más tarde.
            </p>
          )}

          {data && (
            <>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-ink py-3 sm:grid-cols-3">
                <Figure label="Casos en el período" value={formatCount(totalCount ?? 0)} />
                <Figure label={`Tasa ×100.000, ${rateAreaLabel}`} value={formatRate(overallRate)} warning={lowPopulation} />
                <Figure
                  label="Variación vs. mismo período, año anterior"
                  value={change === null ? 'Sin dato' : `${change >= 0 ? '+' : '−'}${formatRate(Math.abs(change))} %`}
                />
              </dl>

              <div className="mt-5 lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:items-start lg:gap-x-8">
                <nav
                  aria-label="Secciones de estadísticas"
                  className="-mx-4 mb-4 flex gap-x-1 overflow-x-auto border-b border-ink px-4 pb-0 lg:sticky lg:top-0 lg:mx-0 lg:mb-0 lg:flex-col lg:gap-x-0 lg:gap-y-0.5 lg:border-b-0 lg:px-0"
                >
                  {INDEX.map((entry) => (
                    <a
                      key={entry.id}
                      href={`#${entry.id}`}
                      className="shrink-0 border-b-2 border-transparent px-2 py-2 text-[13.5px] font-medium whitespace-nowrap text-ink-2 hover:text-ink lg:border-b-0 lg:border-l-2 lg:px-2.5 lg:py-1.5 lg:hover:border-sello lg:hover:bg-sheet"
                    >
                      {entry.label}
                    </a>
                  ))}
                </nav>

                <div className="min-w-0">
                  <StatsSection id="incidentes" title="Incidentes" measures="Casos por tipo y su serie mensual, del año y meses filtrados." anchor="conteo-y-tasa">
                    <MonthlyChart points={data.timeseries} months={filters.months} year={filters.year} />
                    <RateTable
                      className="mt-4"
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
                  </StatsSection>

                  <StatsSection
                    id="territorio"
                    title="Territorio"
                    measures={
                      (filters.province ? 'Casos y tasa por cantón, dentro de la provincia elegida' : 'Casos y tasa por provincia') +
                      ', más el ranking nacional de cantones por tasa.'
                    }
                    anchor="conteo-y-tasa"
                  >
                    <h3 className="label mt-1 text-ink-3">{filters.province ? 'Por cantón' : 'Por provincia'}</h3>
                    <RateTable
                      className="mt-2"
                      caption={
                        (filters.province ? 'Casos y tasa por cantón, dentro de la provincia elegida' : 'Casos y tasa por provincia') +
                        ' (tasa = casos por 100.000 habitantes)'
                      }
                      keyHeader={filters.province ? 'Cantón' : 'Provincia'}
                      rows={data.byPlace}
                      defaultSort="count"
                    />
                    <h3 className="label mt-4 text-ink-3">Cantones con mayor tasa (top 15, todo el país)</h3>
                    <RateTable
                      className="mt-2"
                      caption="Los 15 cantones con mayor tasa por 100.000 habitantes, en todo el país (tasa = casos por 100.000 habitantes)"
                      keyHeader="Cantón"
                      rows={rankByRate(data.cantonRanking, 15)}
                      defaultSort="rate_per_100k"
                    />
                  </StatsSection>

                  <StatsSection
                    id="extorsion"
                    title="Extorsión"
                    measures="Denuncias de extorsión registradas por la Fiscalía y el OECO, no una medición total del delito."
                    anchor="semaforo-extorsion"
                  >
                    <h3 className="label mt-1 text-ink-3">Por año</h3>
                    <RateTable
                      className="mt-2"
                      caption="Denuncias de extorsión y tasa por año (tasa = casos por 100.000 habitantes)"
                      keyHeader="Año"
                      rows={data.extorsionByYear}
                      defaultSort="label"
                      defaultDirection="asc"
                    />
                    <h3 className="label mt-4 text-ink-3">Cantones con mayor tasa (top 15, {filters.year})</h3>
                    <RateTable
                      className="mt-2"
                      caption="Los 15 cantones con mayor tasa de extorsión por 100.000 habitantes (tasa = casos por 100.000 habitantes)"
                      keyHeader="Cantón"
                      rows={rankByRate(data.extorsionRanking, 15)}
                      defaultSort="rate_per_100k"
                    />
                  </StatsSection>

                  <StatsSection
                    id="siniestros"
                    title="Siniestros de tránsito"
                    measures="Siniestros de tránsito reportados por el INEC (ESTRA), por cantón: la fuente no publica coordenadas."
                    anchor="por-canton"
                  >
                    <h3 className="label mt-1 text-ink-3">Por año</h3>
                    <RateTable
                      className="mt-2"
                      caption="Siniestros de tránsito y tasa por año (tasa = casos por 100.000 habitantes)"
                      keyHeader="Año"
                      rows={data.siniestrosByYear}
                      defaultSort="label"
                      defaultDirection="asc"
                    />
                    <h3 className="label mt-4 text-ink-3">Cantones con mayor tasa (top 15, {filters.year})</h3>
                    <RateTable
                      className="mt-2"
                      caption="Los 15 cantones con mayor tasa de siniestros de tránsito por 100.000 habitantes (tasa = casos por 100.000 habitantes)"
                      keyHeader="Cantón"
                      rows={rankByRate(data.siniestrosRanking, 15)}
                      defaultSort="rate_per_100k"
                    />
                  </StatsSection>

                  <StatsSection
                    id="actividad-policial"
                    title="Actividad policial"
                    measures="Detenciones y aprehensiones: acciones de la Policía, no hechos de inseguridad — no es inseguridad, nunca se suman a los casos de arriba."
                    anchor="detenciones"
                    isLast
                  >
                    <h3 className="label mt-1 text-ink-3">Por año</h3>
                    <RateTable
                      className="mt-2"
                      caption="Detenciones y tasa por año (tasa = casos por 100.000 habitantes)"
                      keyHeader="Año"
                      rows={data.detentionsByYear}
                      defaultSort="label"
                      defaultDirection="asc"
                    />
                    <h3 className="label mt-4 text-ink-3">Por provincia</h3>
                    <RateTable
                      className="mt-2"
                      caption="Detenciones y tasa por provincia (tasa = casos por 100.000 habitantes)"
                      keyHeader="Provincia"
                      rows={data.detentionsByProvince}
                      defaultSort="count"
                    />
                  </StatsSection>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Figure({ label, value, warning }: { label: string; value: string; warning?: boolean }) {
  return (
    <div>
      <p className="label text-ink-3">{label}</p>
      <p className="mt-0.5 text-[24px] font-semibold tabular-nums">
        {value}
        {warning && (
          <span title="Población menor a 10.000 habitantes: la tasa es poco estable" className="ml-1 text-[16px]">
            ⚠
          </span>
        )}
      </p>
    </div>
  )
}

function StatsSection({
  id,
  title,
  measures,
  anchor,
  isLast,
  children,
}: {
  id: string
  title: string
  measures: string
  anchor: string
  isLast?: boolean
  children: ReactNode
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={`scroll-mt-4 border-b border-rule-soft py-5 ${isLast ? 'border-b-0' : ''}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={`${id}-title`} className="text-[19px] leading-snug font-semibold">
          {title}
        </h2>
        <Link to={`/metodologia#${anchor}`} className="text-[13px] font-medium text-ink underline hover:no-underline">
          Cómo se calcula
        </Link>
      </div>
      <p className="mt-1 max-w-[70ch] text-[13.5px] text-ink-2">{measures}</p>
      <div className="mt-3 text-[14px] text-ink-2">{children}</div>
    </section>
  )
}

function MonthlyChart({ points, months, year }: { points: TimeseriesPoint[]; months: number[]; year: number }) {
  const series = buildMonthlySeries(points, months)

  if (series.length < 2) {
    return <p className="text-[13.5px] text-ink-3">Elige más de un mes para ver la tendencia mensual.</p>
  }

  const counts = series.map((point) => point.count)
  const maxCount = Math.max(1, ...counts)

  const width = 360
  const height = 140
  const padding = { top: 10, bottom: 10 }
  const columnX = (index: number) => ((index + 0.5) / series.length) * width
  const yScale = linearScale([0, maxCount], [height - padding.bottom, padding.top])
  const path = buildLinePath(series.map((point, index) => ({ x: columnX(index), y: yScale(point.count) })))

  return (
    <div>
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
        <path d={path} fill="none" stroke="var(--color-sello)" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full table-fixed border-collapse text-[12.5px]">
          <caption className="sr-only">Casos por mes, {year}: la misma información que el gráfico, en tabla.</caption>
          <thead>
            <tr className="border-y border-ink">
              {series.map((point) => (
                <th key={point.month} scope="col" className="label py-1 text-center font-semibold text-ink-3">
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
  className?: string
  caption: string
  keyHeader: string
  rows: StatsRow[]
  defaultSort?: StatsSortColumn
  defaultDirection?: SortDirection
  renderKey?: (row: StatsRow) => ReactNode
}

function RateTable({ className, caption, keyHeader, rows, defaultSort = 'count', defaultDirection = 'desc', renderKey }: RateTableProps) {
  const [sortColumn, setSortColumn] = useState<StatsSortColumn>(defaultSort)
  const [direction, setDirection] = useState<SortDirection>(defaultDirection)
  const sorted = useMemo(() => sortStatsRows(rows, sortColumn, direction), [rows, sortColumn, direction])

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
        <button type="button" onClick={() => toggle(column)} className={`inline-flex items-center gap-1 hover:text-ink ${active ? 'text-ink' : ''}`}>
          {label}
          {active && <span aria-hidden="true">{direction === 'asc' ? '▲' : '▼'}</span>}
        </button>
      </th>
    )
  }

  return (
    <div className={`overflow-x-auto ${className ?? ''}`}>
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
              <td className="py-1.5 text-right whitespace-nowrap tabular-nums">{formatCount(row.count)}</td>
              <td className="py-1.5 text-right whitespace-nowrap tabular-nums text-ink-3">{formatCount(row.population)}</td>
              <td className="py-1.5 text-right whitespace-nowrap tabular-nums">
                {formatRate(row.rate_per_100k)}
                {row.low_population_warning && <span title="Población menor a 10.000 habitantes: la tasa es poco estable"> ⚠</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
