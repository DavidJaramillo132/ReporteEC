import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FilterStrip } from './components/FilterStrip'
import { MethodologyPanel, SourcesPanel } from './components/InfoPanels'
import {
  type FocusRequest,
  IncidentMap,
  MARKS_ZOOM,
  type MapView,
  type ViewBounds,
} from './components/IncidentMap'
import { MapLegend } from './components/MapLegend'
import { type ColumnTab, Masthead } from './components/Masthead'
import { RegistryColumn } from './components/RegistryColumn'
import { TimeRule } from './components/TimeRule'
import type { AdminUnitsResponse, IncidentDetail, IncidentListResponse, MetaResponse } from './lib/api'
import { getAdminUnits, getIncident, getIncidents, getMeta } from './lib/api'
import { clearSavedView, loadSavedView, saveView } from './lib/persist'
import type { Confidence, Filters } from './lib/registry'
import { INCIDENT_TYPES, MONTHS } from './lib/registry'

const SAVED = loadSavedView()
const PAGE_SIZE = 40
const LIST_DEBOUNCE_MS = 250
const EMPTY_LIST: IncidentListResponse = { total: 0, counts_by_type: {}, items: [] }

// Lets the map mount (and show data) immediately, before the bootstrap fetch
// (meta + admin units) resolves and a real Filters exists.
const FALLBACK_FILTERS: Filters = {
  year: new Date().getFullYear(),
  months: Array.from({ length: 12 }, (_, i) => i + 1),
  types: [...INCIDENT_TYPES],
  province: null,
  canton: null,
  detentions: false,
}

export default function App() {
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading')
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0)
  const [meta, setMeta] = useState<MetaResponse | null>(null)
  const [adminUnits, setAdminUnits] = useState<AdminUnitsResponse | null>(null)

  const [filters, setFilters] = useState<Filters | null>(SAVED?.filters ?? null)
  const [selectedId, setSelectedId] = useState<number | null>(SAVED?.selectedId ?? null)
  const [selectedDetail, setSelectedDetail] = useState<IncidentDetail | null>(null)
  const [bounds, setBounds] = useState<ViewBounds | null>(null)
  const [mapView, setMapView] = useState<MapView | null>(SAVED?.map ?? null)
  const [focus, setFocus] = useState<FocusRequest | null>(null)
  const [tab, setTab] = useState<ColumnTab>('registro')
  const [restored, setRestored] = useState(Boolean(SAVED))
  const columnRef = useRef<HTMLDivElement>(null)

  const [listStatus, setListStatus] = useState<'loading' | 'error' | 'ready'>('loading')
  const [listResult, setListResult] = useState<IncidentListResponse>(EMPTY_LIST)
  const [listAttempt, setListAttempt] = useState(0)
  const requestIdRef = useRef(0)

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([getMeta(controller.signal), getAdminUnits(controller.signal)])
      .then(([meta, adminUnits]) => {
        setMeta(meta)
        setAdminUnits(adminUnits)
        setFilters((current) => current ?? defaultFilters(meta))
        setStatus('ready')
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          console.error(error)
          setStatus('error')
        }
      })
    return () => controller.abort()
  }, [bootstrapAttempt])

  const lastMonth = meta?.period.to ? Number(meta.period.to.slice(5, 7)) : 12

  // The registry column's data: fetched from the API for the current
  // filters + map viewport, debounced so panning does not flood the backend.
  useEffect(() => {
    if (!filters || !bounds) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      requestIdRef.current += 1
      const requestId = requestIdRef.current
      setListStatus('loading')
      getIncidents(
        {
          year: filters.year,
          months: filters.months,
          types: filters.types,
          province: filters.province,
          canton: filters.canton,
          bbox: [bounds.west, bounds.south, bounds.east, bounds.north],
          limit: PAGE_SIZE,
          offset: 0,
        },
        controller.signal,
      )
        .then((result) => {
          if (requestIdRef.current !== requestId) return
          setListResult(result)
          setListStatus('ready')
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) {
            console.error(error)
            setListStatus('error')
          }
        })
    }, LIST_DEBOUNCE_MS)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [filters, bounds, listAttempt])

  const loadMore = useCallback(() => {
    if (!filters || !bounds) return
    const requestId = requestIdRef.current
    getIncidents({
      year: filters.year,
      months: filters.months,
      types: filters.types,
      province: filters.province,
      canton: filters.canton,
      bbox: [bounds.west, bounds.south, bounds.east, bounds.north],
      limit: PAGE_SIZE,
      offset: listResult.items.length,
    })
      .then((page) => {
        // Filters or the viewport moved on while this was in flight: its
        // rows no longer belong to what listResult currently holds.
        if (requestIdRef.current !== requestId) return
        setListResult((current) => ({
          total: page.total,
          counts_by_type: page.counts_by_type,
          items: [...current.items, ...page.items],
        }))
      })
      .catch((error: unknown) => console.error(error))
  }, [filters, bounds, listResult.items.length])

  // The full detail (source, record id) for whichever entry is selected,
  // from either a map click or a registry row. Left in place (not reset)
  // when selectedId clears; `visibleDetail` below masks it instead.
  useEffect(() => {
    if (selectedId === null) return
    const controller = new AbortController()
    getIncident(selectedId, controller.signal)
      .then((detail) => setSelectedDetail(detail))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) console.error(error)
      })
    return () => controller.abort()
  }, [selectedId])

  // Guards against showing the previous selection's detail while the new
  // one is still in flight, and hides it once the panel is closed.
  const visibleDetail = selectedId !== null && selectedDetail?.id === selectedId ? selectedDetail : null

  const provinceOptions = adminUnits?.provinces ?? []
  const selectedProvince = filters?.province ?? null
  const cantonOptions = useMemo(
    () =>
      selectedProvince
        ? (adminUnits?.cantons ?? []).filter((c) => c.province_code === selectedProvince)
        : [],
    [adminUnits, selectedProvince],
  )

  const presentConfidence = useMemo(
    () => [...new Set(listResult.items.map((i) => i.confidence))] as Confidence[],
    [listResult.items],
  )

  const lastUpdatedAt = useMemo(() => {
    if (!meta || !visibleDetail) return null
    return meta.last_runs.find((run) => run.slug === visibleDetail.source_slug)?.finished_at ?? null
  }, [meta, visibleDetail])

  useEffect(() => {
    if (filters && mapView) saveView({ filters, map: mapView, selectedId })
  }, [filters, mapView, selectedId])

  const update = (patch: Partial<Filters>) => setFilters((f) => (f ? { ...f, ...patch } : f))

  const selectIncident = useCallback((id: number, coordinates: [number, number] | null, fly: boolean) => {
    setSelectedId(id)
    setTab('registro')
    if (fly && coordinates) setFocus({ id, coordinates, nonce: Date.now() })
    columnRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const handleMapSelect = useCallback((id: number) => selectIncident(id, null, false), [selectIncident])

  const handleViewChange = useCallback((b: ViewBounds, v: MapView) => {
    setBounds(b)
    setMapView(v)
  }, [])

  const resetConsultation = () => {
    clearSavedView()
    window.location.reload()
  }

  const periodLabel = filters ? describePeriod(filters.year, filters.months, lastMonth) : ''
  const zoomedOut = (bounds?.zoom ?? 0) < MARKS_ZOOM

  return (
    <div className="flex min-h-full flex-col lg:h-full lg:overflow-hidden">
      <Masthead cutDate={meta?.period.to ?? null} tab={tab} onTab={setTab} />

      {filters && (
        <FilterStrip
          provinces={provinceOptions}
          cantons={cantonOptions}
          province={filters.province}
          canton={filters.canton}
          types={filters.types}
          typeCounts={listResult.counts_by_type}
          detentions={filters.detentions}
          onProvince={(province) => update({ province, canton: null })}
          onCanton={(canton) => update({ canton })}
          onToggleType={(type) =>
            update({
              types: filters.types.includes(type)
                ? filters.types.filter((t) => t !== type)
                : [...filters.types, type],
            })
          }
          onDetentions={(detentions) => update({ detentions })}
        />
      )}

      <main className="flex flex-1 flex-col lg:min-h-0 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)] lg:grid-rows-[minmax(0,1fr)]">
        <div className="flex flex-col lg:min-h-0 lg:border-r lg:border-ink">
          <div className="relative h-[62svh] min-h-[340px] shrink-0 lg:h-auto lg:min-h-0 lg:flex-1 lg:shrink">
            <IncidentMap
              filters={filters ?? FALLBACK_FILTERS}
              showDetentions={Boolean(filters?.detentions)}
              selectedId={selectedId}
              initialView={SAVED?.map ?? null}
              focus={focus}
              onSelect={handleMapSelect}
              onViewChange={handleViewChange}
            />
            {filters && (
              <MapLegend
                types={filters.types.length ? filters.types : INCIDENT_TYPES}
                presentConfidence={presentConfidence}
                detentions={filters.detentions}
                zoomedOut={zoomedOut}
              />
            )}
            {restored && (
              <div className="ink-in absolute top-3 left-3 z-10 flex items-center gap-3 border border-ink bg-sheet px-3 py-1.5 text-[13px]">
                Retomaste tu última consulta.
                <button type="button" onClick={resetConsultation} className="underline hover:no-underline">
                  Empezar de nuevo
                </button>
                <button type="button" onClick={() => setRestored(false)} aria-label="Ocultar aviso" className="text-ink-3 hover:text-ink">
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
              onYear={(year) => update({ year })}
              onMonths={(months) => update({ months })}
            />
          )}
        </div>

        <div ref={columnRef} className="min-h-0 bg-paper lg:overflow-y-auto" aria-label="Columna del registro">
          {tab === 'registro' && (
            <RegistryColumn
              status={status === 'error' ? 'error' : listStatus}
              items={listResult.items}
              total={listResult.total}
              countsByType={listResult.counts_by_type}
              hasMore={listResult.items.length < listResult.total}
              onLoadMore={loadMore}
              periodLabel={periodLabel}
              zoomedOut={zoomedOut}
              selectedId={selectedId}
              selected={visibleDetail}
              lastUpdatedAt={lastUpdatedAt}
              onSelect={(item) => selectIncident(item.id, [item.lon, item.lat], true)}
              onCloseDetail={() => setSelectedId(null)}
              onRetry={() => {
                if (status === 'error') {
                  setStatus('loading')
                  setBootstrapAttempt((n) => n + 1)
                } else {
                  setListAttempt((n) => n + 1)
                }
              }}
              onOpenMethodology={() => setTab('metodologia')}
            />
          )}
          {tab === 'metodologia' && <MethodologyPanel />}
          {tab === 'fuentes' && <SourcesPanel />}
        </div>
      </main>
    </div>
  )
}

function defaultFilters(meta: MetaResponse): Filters {
  const until = meta.period.to
  const year = until ? Number(until.slice(0, 4)) : new Date().getFullYear()
  const lastMonth = until ? Number(until.slice(5, 7)) : 12
  return {
    year,
    months: Array.from({ length: lastMonth }, (_, i) => i + 1),
    types: [...INCIDENT_TYPES],
    province: null,
    canton: null,
    detentions: false,
  }
}

function describePeriod(year: number, months: number[], lastMonth: number) {
  const full = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  const sorted = [...months].sort((a, b) => a - b)
  const contiguous = sorted.every((m, i) => i === 0 || m === sorted[i - 1] + 1)
  if (sorted.length === lastMonth && contiguous && sorted[0] === 1) return `enero–${full[lastMonth - 1]} ${year}`
  if (sorted.length === 1) return `${full[sorted[0] - 1]} ${year}`
  if (contiguous) return `${full[sorted[0] - 1]}–${full[sorted.at(-1)! - 1]} ${year}`
  return `${sorted.map((m) => MONTHS[m - 1].toLowerCase()).join(', ')} ${year}`
}
