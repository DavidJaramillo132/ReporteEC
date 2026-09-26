import { useCallback, useEffect, useMemo, useState } from 'react'
import type { MapView } from './components/IncidentMap'
import { IntroDialog } from './components/IntroDialog'
import { Masthead } from './components/Masthead'
import type { AdminUnitsResponse, MetaResponse } from './lib/api'
import { getAdminUnits, getMeta } from './lib/api'
import { hasSeenIntro, markIntroSeen } from './lib/firstVisit'
import { lastPublishedMonth, monthsForYear } from './lib/period'
import { clearSavedView, loadSavedView, saveView } from './lib/persist'
import type { Filters } from './lib/registry'
import { FALLBACK_FILTERS, INCIDENT_TYPES } from './lib/registry'
import { matchRoute, replaceQuery, useRoute } from './lib/router'
import { filtersToSearch, hasUrlFilters, parseFiltersFromSearch } from './lib/urlState'
import { Estadisticas } from './pages/Estadisticas'
import { Fuentes } from './pages/Fuentes'
import { Mapa } from './pages/Mapa'
import { Metodologia } from './pages/Metodologia'
import { NoEncontrada } from './pages/NoEncontrada'

const SAVED = loadSavedView()

function defaultFilters(meta: MetaResponse): Filters {
  const until = meta.period.to
  const year = until ? Number(until.slice(0, 4)) : new Date().getFullYear()
  const lastMonth = lastPublishedMonth(year, until)
  return {
    year,
    months: Array.from({ length: lastMonth }, (_, i) => i + 1),
    types: [...INCIDENT_TYPES],
    province: null,
    canton: null,
    detentions: false,
    cantonLayer: 'none',
  }
}

/** The URL wins over a saved consultation (see the plan); either way, the
 * map mounts immediately with whatever this returns (or FALLBACK_FILTERS in
 * pages/Mapa.tsx, if this is null) -- never waiting on the bootstrap fetch. */
function initialFilters(): Filters | null {
  const search = window.location.search
  if (hasUrlFilters(search)) {
    return parseFiltersFromSearch(search, FALLBACK_FILTERS, lastPublishedMonth(FALLBACK_FILTERS.year, null))
  }
  return SAVED?.filters ?? null
}

/**
 * The app shell: bootstrap (meta + admin units), the route switch (see
 * lib/router.ts), the filter state shared between `/` and `/estadisticas`
 * (so switching between them keeps the same filters), and IntroDialog.
 * Everything else lives in pages/*.tsx.
 */
export default function App() {
  const pathname = useRoute()
  const route = matchRoute(pathname)

  const [bootstrapStatus, setBootstrapStatus] = useState<'loading' | 'error' | 'ready'>('loading')
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0)
  const [meta, setMeta] = useState<MetaResponse | null>(null)
  const [adminUnits, setAdminUnits] = useState<AdminUnitsResponse | null>(null)

  const [filters, setFilters] = useState<Filters | null>(initialFilters)
  const [mapView, setMapView] = useState<MapView | null>(SAVED?.map ?? null)
  const [restored] = useState(() => Boolean(SAVED) && !hasUrlFilters(window.location.search))
  const [restoredDismissed, setRestoredDismissed] = useState(false)

  // First-visit intro dialog (see components/IntroDialog.tsx): shown once
  // automatically, and reopenable on demand from the map legend.
  const [introOpen, setIntroOpen] = useState(() => !hasSeenIntro())
  const closeIntro = useCallback(() => {
    setIntroOpen(false)
    markIntroSeen()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([getMeta(controller.signal), getAdminUnits(controller.signal)])
      .then(([meta, adminUnits]) => {
        setMeta(meta)
        setAdminUnits(adminUnits)
        setFilters((current) => {
          if (!current) return defaultFilters(meta)
          // Re-clamp months now that the real data cut is known: the
          // optimistic guess used above (from the URL or a saved
          // consultation) assumed a full year for lack of anything better.
          const realLastMonth = lastPublishedMonth(current.year, meta.period.to)
          return { ...current, months: monthsForYear(current.months, 12, realLastMonth) }
        })
        setBootstrapStatus('ready')
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          console.error(error)
          setBootstrapStatus('error')
        }
      })
    return () => controller.abort()
  }, [bootstrapAttempt])

  const lastMonth = lastPublishedMonth(filters?.year ?? FALLBACK_FILTERS.year, meta?.period.to)
  const urlDefaults = useMemo(() => (meta ? defaultFilters(meta) : FALLBACK_FILTERS), [meta])

  // Keeps the query string in sync with the filters, only on the two pages
  // that read them back (see the plan); replaceState so tweaking a filter
  // never grows browser history (see lib/router.ts).
  useEffect(() => {
    if (!filters) return
    if (route !== 'mapa' && route !== 'estadisticas') return
    replaceQuery(filtersToSearch(filters, urlDefaults, lastMonth))
  }, [filters, route, urlDefaults, lastMonth])

  useEffect(() => {
    if (filters && mapView) saveView({ filters, map: mapView })
  }, [filters, mapView])

  const changeYear = useCallback(
    (year: number) =>
      setFilters((f) =>
        f
          ? {
              ...f,
              year,
              months: monthsForYear(f.months, lastPublishedMonth(f.year, meta?.period.to), lastPublishedMonth(year, meta?.period.to)),
            }
          : f,
      ),
    [meta],
  )
  const update = useCallback((patch: Partial<Filters>) => setFilters((f) => (f ? { ...f, ...patch } : f)), [])

  const resetConsultation = () => {
    clearSavedView()
    window.location.reload()
  }

  return (
    <div className="flex min-h-full flex-col lg:h-full lg:overflow-hidden">
      <IntroDialog open={introOpen} onClose={closeIntro} />
      <Masthead cutDate={meta?.period.to ?? null} route={route} />

      {route === 'mapa' && (
        <Mapa
          filters={filters}
          onUpdate={update}
          onChangeYear={changeYear}
          meta={meta}
          adminUnits={adminUnits}
          lastMonth={lastMonth}
          bootstrapStatus={bootstrapStatus}
          onRetryBootstrap={() => {
            setBootstrapStatus('loading')
            setBootstrapAttempt((n) => n + 1)
          }}
          mapView={mapView}
          onMapViewChange={setMapView}
          restored={restored && !restoredDismissed}
          onDismissRestored={() => setRestoredDismissed(true)}
          onResetConsultation={resetConsultation}
          onShowIntro={() => setIntroOpen(true)}
        />
      )}
      {route === 'estadisticas' && filters && (
        <Estadisticas filters={filters} onUpdate={update} onChangeYear={changeYear} meta={meta} adminUnits={adminUnits} lastMonth={lastMonth} />
      )}
      {route === 'metodologia' && (
        <div className="min-h-0 flex-1 bg-paper lg:overflow-y-auto">
          <Metodologia />
        </div>
      )}
      {route === 'fuentes' && (
        <div className="min-h-0 flex-1 bg-paper lg:overflow-y-auto">
          <Fuentes meta={meta} />
        </div>
      )}
      {route === 'no-encontrada' && (
        <div className="min-h-0 flex-1 bg-paper lg:overflow-y-auto">
          <NoEncontrada />
        </div>
      )}
    </div>
  )
}
