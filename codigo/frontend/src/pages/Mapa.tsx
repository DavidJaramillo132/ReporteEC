import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IncidentCard } from '../components/IncidentCard'
import { FilterStrip } from '../components/FilterStrip'
import { type MapView, IncidentMap, MARKS_ZOOM, type ViewBounds } from '../components/IncidentMap'
import { MapLegend } from '../components/MapLegend'
import { TimeRule } from '../components/TimeRule'
import type { AdminUnitsResponse, CantonIndicatorsResponse, IncidentDetail, MetaResponse, StatsRow } from '../lib/api'
import { getCantonIndicators, getIncident, getStats } from '../lib/api'
import { checkYearAvailability, indicatorForLayer, noDataMessage } from '../lib/cantonChoropleth'
import type { Filters } from '../lib/registry'
import { CONFIDENCE_ORDER, FALLBACK_FILTERS, INCIDENT_TYPES } from '../lib/registry'

interface MapaProps {
  /** null only until the bootstrap fetch (meta + admin units) resolves -- the map still mounts and draws immediately (see FALLBACK_FILTERS), just without the filter/time controls yet. */
  filters: Filters | null
  onUpdate: (patch: Partial<Filters>) => void
  onChangeYear: (year: number) => void
  meta: MetaResponse | null
  adminUnits: AdminUnitsResponse | null
  lastMonth: number
  bootstrapStatus: 'loading' | 'error' | 'ready'
  onRetryBootstrap: () => void
  mapView: MapView | null
  onMapViewChange: (view: MapView) => void
  restored: boolean
  onDismissRestored: () => void
  onResetConsultation: () => void
  onShowIntro: () => void
}

interface Selection {
  id: number
  coordinates: [number, number]
}

/** The map page: `/` (see the plan). Full width, no registry column -- clicking a mark opens IncidentCard instead of a list row. */
export function Mapa({
  filters,
  onUpdate,
  onChangeYear,
  meta,
  adminUnits,
  lastMonth,
  bootstrapStatus,
  onRetryBootstrap,
  mapView,
  onMapViewChange,
  restored,
  onDismissRestored,
  onResetConsultation,
  onShowIntro,
}: MapaProps) {
  useEffect(() => {
    document.title = 'ReporteEC · Registro público de incidentes'
  }, [])

  const activeFilters = filters ?? FALLBACK_FILTERS
  const mapWrapperRef = useRef<HTMLDivElement>(null)

  const [bounds, setBounds] = useState<ViewBounds | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [selectedDetail, setSelectedDetail] = useState<IncidentDetail | null>(null)
  const [detailErrorId, setDetailErrorId] = useState<number | null>(null)
  const [detailAttempt, setDetailAttempt] = useState(0)
  const [screenPoint, setScreenPoint] = useState<{ x: number; y: number } | null>(null)

  const offline = useOfflineStatus()

  // Type-chip counts (FilterStrip): from /api/stats?dimension=type, scoped
  // to year/months/province/canton but deliberately WITHOUT bbox, so panning
  // the map never changes them (see the plan).
  const [typeStats, setTypeStats] = useState<StatsRow[]>([])
  const [statsError, setStatsError] = useState(false)
  const [statsAttempt, setStatsAttempt] = useState(0)
  useEffect(() => {
    if (!filters) return
    const controller = new AbortController()
    getStats(
      {
        dimension: 'type',
        scope: 'map',
        year: filters.year,
        months: filters.months,
        province: filters.province,
        canton: filters.canton,
      },
      controller.signal,
    )
      .then((result) => {
        setTypeStats(result.rows)
        setStatsError(false)
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          console.error(error)
          setStatsError(true)
        }
      })
    return () => controller.abort()
  }, [filters, statsAttempt])
  const typeCounts = useMemo(
    () => Object.fromEntries(typeStats.map((row) => [row.key, row.count])),
    [typeStats],
  )

  // The canton choropleth's rows (extortion / traffic crashes): independent
  // of type/province/canton/months, so it only refetches on its own control
  // or the year.
  const [cantonData, setCantonData] = useState<CantonIndicatorsResponse | null>(null)
  useEffect(() => {
    if (!filters || filters.cantonLayer === 'none') return
    const controller = new AbortController()
    getCantonIndicators(indicatorForLayer(filters.cantonLayer), filters.year, controller.signal)
      .then((result) => setCantonData(result))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) console.error(error)
      })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters?.cantonLayer, filters?.year])

  // The selected incident's full detail (source, record id) -- fetched fresh
  // for every new selection. Deliberately never resets `selectedDetail`
  // itself here (that would setState synchronously in the effect body);
  // instead `visibleDetail` below masks it to whichever incident is
  // currently selected, exactly like `detailErrorId` does for the error.
  useEffect(() => {
    if (!selection) return
    const controller = new AbortController()
    getIncident(selection.id, controller.signal)
      .then((detail) => {
        setSelectedDetail(detail)
        setDetailErrorId(null)
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          console.error(error)
          setDetailErrorId(selection.id)
        }
      })
    return () => controller.abort()
  }, [selection, detailAttempt])

  const visibleDetail = selection && selectedDetail?.id === selection.id ? selectedDetail : null
  const detailError = selection !== null && detailErrorId === selection.id

  const lastUpdatedAt = useMemo(() => {
    if (!meta || !visibleDetail) return null
    return meta.last_runs.find((run) => run.slug === visibleDetail.source_slug)?.finished_at ?? null
  }, [meta, visibleDetail])

  const provinceOptions = adminUnits?.provinces ?? []
  const selectedProvince = filters?.province ?? null
  const cantonOptions = useMemo(
    () => (selectedProvince ? (adminUnits?.cantons ?? []).filter((c) => c.province_code === selectedProvince) : []),
    [adminUnits, selectedProvince],
  )

  const cantonLayer = activeFilters.cantonLayer
  const cantonDataFresh =
    cantonData && cantonLayer !== 'none' && cantonData.indicator === indicatorForLayer(cantonLayer) && cantonData.year === activeFilters.year
      ? cantonData
      : null
  const cantonRows = cantonDataFresh?.rows ?? []
  const cantonYear = activeFilters.year
  const cantonYearAvailability = useMemo(
    () => (cantonDataFresh ? checkYearAvailability(cantonDataFresh.available_years, cantonDataFresh.year) : null),
    [cantonDataFresh],
  )

  const zoomedOut = (bounds?.zoom ?? 0) < MARKS_ZOOM

  const handleSelect = useCallback((id: number, coordinates: [number, number]) => {
    setSelection({ id, coordinates })
  }, [])
  const handleDeselect = useCallback(() => setSelection(null), [])

  const handleViewChange = useCallback(
    (b: ViewBounds, v: MapView) => {
      setBounds(b)
      onMapViewChange(v)
    },
    [onMapViewChange],
  )

  return (
    <>
      {filters && (
        <FilterStrip
          provinces={provinceOptions}
          cantons={cantonOptions}
          province={filters.province}
          canton={filters.canton}
          types={filters.types}
          typeCounts={typeCounts}
          onProvince={(province) => onUpdate({ province, canton: null })}
          onCanton={(canton) => onUpdate({ canton })}
          onToggleType={(type) =>
            onUpdate({
              types: filters.types.includes(type) ? filters.types.filter((t) => t !== type) : [...filters.types, type],
            })
          }
          mapControls={{
            detentions: filters.detentions,
            cantonLayer: filters.cantonLayer,
            onDetentions: (detentions) => onUpdate({ detentions }),
            onCantonLayer: (cantonLayer) => onUpdate({ cantonLayer }),
          }}
        />
      )}

      <div className="flex flex-1 flex-col lg:min-h-0">
        <div ref={mapWrapperRef} className="relative h-[70svh] min-h-[340px] shrink-0 lg:h-auto lg:min-h-0 lg:flex-1">
          <IncidentMap
            filters={activeFilters}
            showDetentions={activeFilters.detentions}
            cantonLayer={cantonLayer}
            cantonRows={cantonRows}
            cantonYear={cantonYear}
            selectedId={selection?.id ?? null}
            selectedCoordinates={selection?.coordinates ?? null}
            initialView={mapView}
            onSelect={handleSelect}
            onDeselect={handleDeselect}
            onSelectedPoint={setScreenPoint}
            onViewChange={handleViewChange}
          />
          <MapLegend
            types={activeFilters.types.length ? activeFilters.types : INCIDENT_TYPES}
            // The registry column's own bbox fetch (the only source of
            // "which confidence levels are actually visible right now")
            // was removed along with the column itself (see the plan); V1's
            // data is entirely `oficial` in any case, so nothing is muted.
            presentConfidence={CONFIDENCE_ORDER}
            detentions={activeFilters.detentions}
            zoomedOut={zoomedOut}
            cantonLayer={cantonLayer}
            cantonBreakpoints={cantonDataFresh?.breakpoints ?? null}
            cantonYear={cantonYear}
            onShowIntro={onShowIntro}
          />

          {selection && (
            <IncidentCard
              key={selection.id}
              incident={visibleDetail}
              loadError={detailError}
              lastUpdatedAt={lastUpdatedAt}
              point={screenPoint}
              containerRef={mapWrapperRef}
              onClose={handleDeselect}
              onRetry={() => setDetailAttempt((n) => n + 1)}
            />
          )}

          {cantonLayer !== 'none' && cantonYearAvailability && !cantonYearAvailability.hasData && (
            <div className="ink-in absolute top-3 left-1/2 z-10 w-max max-w-[calc(100%-6rem)] -translate-x-1/2 border border-ink bg-sheet px-3 py-1.5 text-[13px]">
              {noDataMessage(cantonLayer, cantonYear)}
              {cantonYearAvailability.latestYear !== null && (
                <>
                  {' '}
                  <button type="button" onClick={() => onChangeYear(cantonYearAvailability.latestYear!)} className="underline hover:no-underline">
                    Ir a {cantonYearAvailability.latestYear}
                  </button>
                </>
              )}
            </div>
          )}

          {bootstrapStatus === 'error' && (
            <div className="ink-in absolute top-3 left-1/2 z-10 flex w-max max-w-[calc(100%-6rem)] -translate-x-1/2 items-center gap-3 border border-ink bg-sheet px-3 py-1.5 text-[13px]">
              {offline ? 'Sin conexión: no se pudo cargar la configuración.' : 'No se pudo cargar la configuración.'}
              <button type="button" onClick={onRetryBootstrap} className="underline hover:no-underline">
                Reintentar
              </button>
            </div>
          )}
          {bootstrapStatus === 'ready' && statsError && (
            <div className="ink-in absolute top-3 left-1/2 z-10 flex w-max max-w-[calc(100%-6rem)] -translate-x-1/2 items-center gap-3 border border-ink bg-sheet px-3 py-1.5 text-[13px]">
              No se pudieron cargar los conteos por tipo.
              <button type="button" onClick={() => setStatsAttempt((n) => n + 1)} className="underline hover:no-underline">
                Reintentar
              </button>
            </div>
          )}

          {restored && (
            <div className="ink-in absolute top-3 left-3 z-10 flex items-center gap-3 border border-ink bg-sheet px-3 py-1.5 text-[13px]">
              Retomaste tu última consulta.
              <button type="button" onClick={onResetConsultation} className="underline hover:no-underline">
                Empezar de nuevo
              </button>
              <button type="button" onClick={onDismissRestored} aria-label="Ocultar aviso" className="text-ink-3 hover:text-ink">
                Ocultar
              </button>
            </div>
          )}
        </div>

        {filters && (
          <TimeRule
            year={filters.year}
            months={filters.months}
            availableYears={meta?.years ?? []}
            lastMonth={lastMonth}
            onYear={onChangeYear}
            onMonths={(months) => onUpdate({ months })}
          />
        )}
      </div>
    </>
  )
}

/** Best-effort: the browser reports no connection right now. */
function useOfflineStatus(): boolean {
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine)
  useEffect(() => {
    const goOnline = () => setOffline(false)
    const goOffline = () => setOffline(true)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])
  return offline
}
