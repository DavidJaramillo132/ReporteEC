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
import { clearSavedView, loadSavedView, saveView } from './lib/persist'
import type { Confidence, Filters, Incident, IncidentType, RegistryMeta } from './lib/registry'
import { INCIDENT_TYPES, MONTHS, applyFilters, byNewest, loadRegistry } from './lib/registry'

const SAVED = loadSavedView()

export default function App() {
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading')
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [meta, setMeta] = useState<RegistryMeta | null>(null)
  const [attempt, setAttempt] = useState(0)

  const [filters, setFilters] = useState<Filters | null>(SAVED?.filters ?? null)
  const [selectedId, setSelectedId] = useState<string | null>(SAVED?.selectedId ?? null)
  const [bounds, setBounds] = useState<ViewBounds | null>(null)
  const [mapView, setMapView] = useState<MapView | null>(SAVED?.map ?? null)
  const [focus, setFocus] = useState<FocusRequest | null>(null)
  const [tab, setTab] = useState<ColumnTab>('registro')
  const [restored, setRestored] = useState(Boolean(SAVED))
  const [detentionsState, setDetentionsState] = useState<'idle' | 'loading' | 'error'>('idle')
  const columnRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    loadRegistry(controller.signal)
      .then(({ incidents, meta }) => {
        setIncidents(incidents)
        setMeta(meta)
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
  }, [attempt])

  const lastMonth = meta?.periodo.hasta ? Number(meta.periodo.hasta.slice(5, 7)) : 12
  const availableYears = useMemo(
    () => [...new Set(incidents.map((i) => Number(i.properties.fecha?.slice(0, 4))).filter(Boolean))],
    [incidents],
  )

  const filtered = useMemo(
    () => (filters ? applyFilters(incidents, filters).sort(byNewest) : []),
    [incidents, filters],
  )

  const inView = useMemo(() => {
    if (!bounds) return filtered
    return filtered.filter(({ geometry }) => {
      const [lng, lat] = geometry.coordinates
      return lng >= bounds.west && lng <= bounds.east && lat >= bounds.south && lat <= bounds.north
    })
  }, [filtered, bounds])

  const provinces = useMemo(() => [...new Set(incidents.map((i) => i.properties.provincia))].sort(), [incidents])
  const provincia = filters?.provincia ?? null
  const cantons = useMemo(
    () =>
      provincia
        ? [...new Set(incidents.filter((i) => i.properties.provincia === provincia).map((i) => i.properties.canton))].sort()
        : [],
    [incidents, provincia],
  )

  /** Counts per type under every filter except the type toggles themselves. */
  const typeCounts = useMemo(() => {
    const counts = Object.fromEntries(INCIDENT_TYPES.map((t) => [t, 0])) as Record<IncidentType, number>
    if (!filters) return counts
    for (const i of applyFilters(incidents, { ...filters, types: INCIDENT_TYPES })) counts[i.properties.tipo] += 1
    return counts
  }, [incidents, filters])

  const presentConfidence = useMemo(
    () => [...new Set(filtered.map((i) => i.properties.confianza))] as Confidence[],
    [filtered],
  )

  const selected = useMemo(
    () => (selectedId ? (filtered.find((i) => i.id === selectedId) ?? null) : null),
    [filtered, selectedId],
  )

  useEffect(() => {
    if (filters && mapView) saveView({ filters, map: mapView, selectedId: selected?.id ?? null })
  }, [filters, mapView, selected])

  const update = (patch: Partial<Filters>) => setFilters((f) => (f ? { ...f, ...patch } : f))

  const selectIncident = useCallback((incident: Incident, fly: boolean) => {
    setSelectedId(incident.id)
    setTab('registro')
    if (fly) setFocus({ id: incident.id, coordinates: incident.geometry.coordinates as [number, number], nonce: Date.now() })
    columnRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const handleMapSelect = useCallback(
    (id: string) => {
      const incident = incidents.find((i) => i.id === id)
      if (incident) selectIncident(incident, false)
    },
    [incidents, selectIncident],
  )

  const handleViewChange = useCallback((b: ViewBounds, v: MapView) => {
    setBounds(b)
    setMapView(v)
  }, [])

  const handleDetentionsLoaded = useCallback((ok: boolean) => setDetentionsState(ok ? 'idle' : 'error'), [])

  const resetConsultation = () => {
    clearSavedView()
    window.location.reload()
  }

  const periodLabel = filters ? describePeriod(filters.year, filters.months, lastMonth) : ''
  const zoomedOut = (bounds?.zoom ?? 0) < MARKS_ZOOM

  return (
    <div className="flex min-h-full flex-col lg:h-full lg:overflow-hidden">
      <Masthead cutDate={meta?.periodo.hasta ?? null} tab={tab} onTab={setTab} />

      {filters && (
        <FilterStrip
          provinces={provinces}
          cantons={cantons}
          provincia={filters.provincia}
          canton={filters.canton}
          types={filters.types}
          typeCounts={typeCounts}
          detentions={filters.detentions}
          detentionsState={detentionsState}
          onProvincia={(provincia) => update({ provincia, canton: null })}
          onCanton={(canton) => update({ canton })}
          onToggleType={(type) =>
            update({
              types: filters.types.includes(type)
                ? filters.types.filter((t) => t !== type)
                : [...filters.types, type],
            })
          }
          onDetentions={(detentions) => {
            if (detentions) setDetentionsState('loading')
            update({ detentions })
          }}
        />
      )}

      <main className="flex flex-1 flex-col lg:min-h-0 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)] lg:grid-rows-[minmax(0,1fr)]">
        <div className="flex flex-col lg:min-h-0 lg:border-r lg:border-ink">
          <div className="relative h-[62svh] min-h-[340px] shrink-0 lg:h-auto lg:min-h-0 lg:flex-1 lg:shrink">
            <IncidentMap
              incidents={filtered}
              showDetentions={Boolean(filters?.detentions)}
              selectedId={selected?.id ?? null}
              initialView={SAVED?.map ?? null}
              focus={focus}
              onSelect={handleMapSelect}
              onViewChange={handleViewChange}
              onDetentionsLoaded={handleDetentionsLoaded}
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
              availableYears={availableYears}
              lastMonth={lastMonth}
              onYear={(year) => update({ year })}
              onMonths={(months) => update({ months })}
            />
          )}
        </div>

        <div ref={columnRef} className="min-h-0 bg-paper lg:overflow-y-auto" aria-label="Columna del registro">
          {tab === 'registro' && (
            <RegistryColumn
              status={status}
              inView={inView}
              periodLabel={periodLabel}
              zoomedOut={zoomedOut}
              selected={selected}
              onSelect={(incident) => selectIncident(incident, true)}
              onCloseDetail={() => setSelectedId(null)}
              onRetry={() => {
                setStatus('loading')
                setAttempt((n) => n + 1)
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

function defaultFilters(meta: RegistryMeta): Filters {
  const until = meta.periodo.hasta
  const year = until ? Number(until.slice(0, 4)) : new Date().getFullYear()
  const lastMonth = until ? Number(until.slice(5, 7)) : 12
  return {
    year,
    months: Array.from({ length: lastMonth }, (_, i) => i + 1),
    types: [...INCIDENT_TYPES],
    provincia: null,
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
