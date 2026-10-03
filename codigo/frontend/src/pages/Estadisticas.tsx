import { useEffect, useMemo } from 'react'
import { FilterStrip } from '../components/FilterStrip'
import { TimeRule } from '../components/TimeRule'
import type { AdminUnitsResponse, MetaResponse } from '../lib/api'
import { formatPeriodLabel } from '../lib/period'
import { type Filters, placeName } from '../lib/registry'
import { CantonIndicatorSection } from './estadisticas/CantonIndicatorSection'
import { IncidentsSection } from './estadisticas/IncidentsSection'
import { PoliceSection } from './estadisticas/PoliceSection'
import { Summary } from './estadisticas/Summary'
import { TerritorySection } from './estadisticas/TerritorySection'
import { useStatsData } from './estadisticas/useStatsData'

interface EstadisticasProps {
  filters: Filters
  onUpdate: (patch: Partial<Filters>) => void
  onChangeYears: (years: number[]) => void
  meta: MetaResponse | null
  adminUnits: AdminUnitsResponse | null
  lastMonth: number
}

const INDEX = [
  { id: 'incidentes', label: 'Incidentes' },
  { id: 'territorio', label: 'Territorio' },
  { id: 'extorsion', label: 'Extorsión' },
  { id: 'siniestros', label: 'Siniestros de tránsito' },
  { id: 'actividad-policial', label: 'Actividad policial' },
]

/**
 * The statistics page: `/estadisticas`. Same shared filters as the map (synced
 * to the URL by App.tsx; any set of years), a summary, and five sections of
 * charts behind a sticky index. Every chart keeps the count and the rate
 * together and opens the same numbers as a table («Ver tabla»).
 */
export function Estadisticas({ filters, onUpdate, onChangeYears, meta, adminUnits, lastMonth }: EstadisticasProps) {
  useEffect(() => {
    document.title = 'Estadísticas · ReporteEC'
  }, [])

  const { data, loading, failed } = useStatsData(filters)
  const periodTo = meta?.period.to

  const provinceName = useMemo(() => {
    const name = adminUnits?.provinces.find((p) => p.code === filters.province)?.name
    return name ? placeName(name) : null
  }, [adminUnits, filters.province])
  const cantonName = useMemo(() => {
    const name = adminUnits?.cantons.find((c) => c.code === filters.canton)?.name
    return name ? placeName(name) : null
  }, [adminUnits, filters.canton])
  const areaName = cantonName ?? provinceName ?? 'Ecuador'

  const typeCounts = useMemo(() => Object.fromEntries((data?.byType ?? []).map((row) => [row.key, row.count])), [data])

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
        years={filters.years}
        months={filters.months}
        availableYears={meta?.years ?? []}
        lastMonth={lastMonth}
        onYears={onChangeYears}
        onMonths={(months) => onUpdate({ months })}
      />

      <div className="min-h-0 flex-1 bg-paper lg:overflow-y-auto">
        <div className="mx-auto max-w-[1400px] px-4 py-5 lg:px-6">
          <header>
            <h1 className="nameplate text-[30px]">Estadísticas</h1>
            <p className="mt-1.5 max-w-[70ch] text-[14px] text-ink-2">
              Casos y tasas por 100.000 habitantes para {areaName} en {formatPeriodLabel(filters.years, filters.months)}, con los
              mismos filtros de años, meses, tipo y lugar que el mapa. Cada gráfico tiene su tabla en «Ver tabla».
            </p>
          </header>

          {loading && !data && (
            <p className="mt-4 text-[14px] text-ink-2" aria-live="polite">
              Cargando estadísticas…
            </p>
          )}
          {failed && (
            <p className="mt-4 text-[14px] text-ink-2" role="alert">
              No se pudieron cargar las estadísticas. Vuelve a intentarlo más tarde.
            </p>
          )}

          {data && (
            // While new filters load, the previous numbers stay (dimmed) instead of jumping to a skeleton.
            <div aria-busy={loading} className={loading ? 'opacity-60' : ''}>
              <Summary
                years={filters.years}
                months={filters.months}
                types={filters.types}
                areaName={areaName}
                byType={data.byType}
                byYear={data.byYear}
                previousPeriodCount={data.previousPeriodCount}
                periodTo={periodTo}
              />

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
                  <IncidentsSection
                    years={filters.years}
                    months={filters.months}
                    types={filters.types}
                    byType={data.byType}
                    timeseries={data.timeseries}
                    byYear={data.byYear}
                    typesPerYear={data.typesPerYear}
                    periodTo={periodTo}
                  />
                  <TerritorySection
                    provinceName={provinceName}
                    cantonSelected={filters.canton !== null}
                    byPlace={data.byPlace}
                    cantonRanking={data.cantonRanking}
                  />
                  <CantonIndicatorSection
                    indicator="extorsion"
                    id="extorsion"
                    title="Extorsión"
                    measures="Denuncias de extorsión registradas por la Fiscalía y el OECO, no una medición total del delito. Datos nacionales y por cantón, sin filtro de meses."
                    anchor="semaforo-extorsion"
                    unit="denuncias"
                    trendNote="Publicación anual: cada columna es un año completo."
                    years={filters.years}
                    data={data.extorsion}
                  />
                  <CantonIndicatorSection
                    indicator="siniestros"
                    id="siniestros"
                    title="Siniestros de tránsito"
                    measures="Siniestros de tránsito reportados por el INEC (ESTRA), por cantón: la fuente no publica coordenadas. Sin filtro de meses."
                    anchor="por-canton"
                    unit="siniestros"
                    trendNote="El año en curso, cuando aparece, es un adelanto parcial del INEC."
                    years={filters.years}
                    data={data.siniestros}
                  />
                  <PoliceSection
                    years={filters.years}
                    months={filters.months}
                    periodTo={periodTo}
                    detentionsByYear={data.detentionsByYear}
                    detentionsByProvince={data.detentionsByProvince}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
