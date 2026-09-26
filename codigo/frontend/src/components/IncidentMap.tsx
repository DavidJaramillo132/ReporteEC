import {
  AttributionControl,
  GeolocateControl,
  type LngLatBoundsLike,
  Map as MapLibreMap,
  NavigationControl,
  Popup,
  ScaleControl,
} from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'
import type { CantonIndicatorRow } from '../lib/api'
import { TILES_URL } from '../lib/api'
import { ECUADOR_BOUNDS, gazetteBasemap } from '../lib/basemap'
import {
  buildCantonPopupHtml,
  buildFeatureStateEntries,
  buildFillColorExpression,
  buildFillOpacityExpression,
} from '../lib/cantonChoropleth'
import { buildMarkImages } from '../lib/marks'
import type { CantonLayer, Filters } from '../lib/registry'
import { buildTileFilter } from '../lib/tileFilter'

export interface MapView {
  center: [number, number]
  zoom: number
}

export interface ViewBounds {
  west: number
  south: number
  east: number
  north: number
  zoom: number
}

interface IncidentMapProps {
  filters: Filters
  showDetentions: boolean
  /** The active canton choropleth (extortion / traffic crashes), independent of showDetentions. */
  cantonLayer: CantonLayer
  /** All 221 cantons' current rows for `cantonLayer`; empty while loading or when it is 'none'. */
  cantonRows: CantonIndicatorRow[]
  /** The year `cantonRows` was fetched for -- shown in the click popup. */
  cantonYear: number
  selectedId: number | null
  /** The selected incident's own coordinates, from the click event that selected it -- used only to keep IncidentCard anchored to its point as the map moves. */
  selectedCoordinates: [number, number] | null
  initialView: MapView | null
  onSelect: (id: number, coordinates: [number, number]) => void
  /** Esc, the card's own close button, or clicking the map away from a mark. */
  onDeselect: () => void
  /** The selected incident's screen position within the map container, or null once it (or the selection) leaves the frame -- recomputed on every pan/zoom so a floating IncidentCard can track it. */
  onSelectedPoint: (point: { x: number; y: number } | null) => void
  onViewChange: (bounds: ViewBounds, view: MapView) => void
}

/** Zoom at which the ink heatmap hands over to individual registry marks. */
export const MARKS_ZOOM = 8.5

/** No incident id is ever this value: a filter that must never match anything. */
const NO_SELECTION = -1

export function IncidentMap({
  filters,
  showDetentions,
  cantonLayer,
  cantonRows,
  cantonYear,
  selectedId,
  selectedCoordinates,
  initialView,
  onSelect,
  onDeselect,
  onSelectedPoint,
  onViewChange,
}: IncidentMapProps) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const readyRef = useRef(false)
  const [baseFailed, setBaseFailed] = useState(false)
  const geolocateRef = useRef<GeolocateControl | null>(null)
  const [location, setLocation] = useState<'off' | 'locating' | 'following' | 'shown' | 'denied' | 'unavailable'>('off')
  // Latest props for handlers bound once at map creation.
  const latest = useRef({
    filters,
    onSelect,
    onDeselect,
    onSelectedPoint,
    onViewChange,
    selectedId,
    selectedCoordinates,
    cantonLayer,
    cantonRows,
    cantonYear,
  })
  useEffect(() => {
    latest.current = {
      filters,
      onSelect,
      onDeselect,
      onSelectedPoint,
      onViewChange,
      selectedId,
      selectedCoordinates,
      cantonLayer,
      cantonRows,
      cantonYear,
    }
  })

  // Projects `selectedCoordinates` to on-screen pixels within the map
  // container, reported via `onSelectedPoint`; kept as a ref so both the
  // map's own 'move'/'resize' listeners (bound once) and the effect below
  // (keyed on the coordinates themselves) call the same up-to-date logic.
  const updateSelectedPoint = useRef(() => {
    const map = mapRef.current
    if (!map) return
    const coords = latest.current.selectedCoordinates
    if (!coords) {
      latest.current.onSelectedPoint(null)
      return
    }
    const point = map.project(coords)
    latest.current.onSelectedPoint({ x: point.x, y: point.y })
  })

  useEffect(() => {
    if (!container.current) return
    const map = new MapLibreMap({
      container: container.current,
      style: gazetteBasemap(),
      ...(initialView
        ? { center: initialView.center, zoom: initialView.zoom }
        : {
            bounds: ECUADOR_BOUNDS as LngLatBoundsLike,
            // On wide screens the printed key sits bottom-left; keep the coast clear of it.
            fitBoundsOptions: {
              padding: window.matchMedia('(min-width: 1024px)').matches
                ? { top: 24, bottom: 24, right: 24, left: 270 }
                : 16,
            },
          }),
      minZoom: 4,
      maxZoom: 17,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    })
    mapRef.current = map
    map.touchZoomRotate.disableRotation()
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-right')
    map.addControl(new AttributionControl({ compact: true }), 'bottom-right')

    // The reader's own position: computed in the browser and never sent anywhere.
    const geolocate = new GeolocateControl({
      positionOptions: { enableHighAccuracy: true, timeout: 15000 },
      trackUserLocation: true,
      showAccuracyCircle: true,
      fitBoundsOptions: { maxZoom: 14 },
    })
    geolocateRef.current = geolocate
    map.addControl(geolocate, 'top-right')
    geolocate.on('trackuserlocationstart', () => setLocation('following'))
    geolocate.on('trackuserlocationend', () => setLocation((s) => (s === 'following' ? 'shown' : s)))
    geolocate.on('geolocate', () => setLocation((s) => (s === 'locating' ? 'following' : s)))
    geolocate.on('error', (event) => setLocation(event.code === 1 ? 'denied' : 'unavailable'))

    const emitView = () => {
      const b = map.getBounds()
      const c = map.getCenter()
      latest.current.onViewChange(
        { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth(), zoom: map.getZoom() },
        { center: [c.lng, c.lat], zoom: map.getZoom() },
      )
    }

    // Data layers mount once the style is parsed, so they never wait on
    // basemap tiles: if the base fails, the registry still draws.
    map.once('style.load', () => {
      for (const { id, data } of buildMarkImages(window.devicePixelRatio || 1)) {
        map.addImage(id, data, { pixelRatio: window.devicePixelRatio || 1 })
      }

      // Canton choropleth (extortion / traffic crashes): added first so it
      // always renders beneath the incident/detentions layers below, never
      // needing a beforeId. promoteId lets setFeatureState/removeFeatureState
      // key on the tile's string `code` property instead of a numeric id.
      map.addSource('cantons', {
        type: 'vector',
        tiles: [`${TILES_URL}/map_cantons/{z}/{x}/{y}`],
        minzoom: 0,
        maxzoom: 14,
        promoteId: 'code',
      })
      map.addLayer({
        id: 'cantons-fill',
        type: 'fill',
        source: 'cantons',
        'source-layer': 'map_cantons',
        layout: { visibility: 'none' },
        paint: {
          'fill-color': buildFillColorExpression(latest.current.cantonLayer === 'siniestros' ? 'siniestros' : 'extorsion'),
          'fill-opacity': buildFillOpacityExpression(),
        },
      })
      map.addLayer({
        id: 'cantons-outline',
        type: 'line',
        source: 'cantons',
        'source-layer': 'map_cantons',
        layout: { visibility: 'none' },
        paint: {
          'line-color': 'rgba(21,33,44,0.35)',
          'line-width': 0.6,
        },
      })

      map.on('click', 'cantons-fill', (event) => {
        const { cantonLayer: activeLayer, cantonRows: rows, cantonYear: year } = latest.current
        if (activeLayer === 'none') return
        const code = event.features?.[0]?.properties?.code as string | undefined
        const row = code ? rows.find((r) => r.code === code) : undefined
        if (!row) return
        new Popup({ closeButton: true, maxWidth: '260px' })
          .setLngLat(event.lngLat)
          .setHTML(buildCantonPopupHtml(activeLayer, row, year))
          .addTo(map)
      })
      map.on('mouseenter', 'cantons-fill', () => {
        if (latest.current.cantonLayer !== 'none') map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'cantons-fill', () => (map.getCanvas().style.cursor = ''))

      // Detentions: empty until the Phase 4 loader runs, but the source and
      // layer exist from the start -- MapLibre only requests tiles for a
      // source-layer combination a visible layer actually needs.
      map.addSource('detentions', {
        type: 'vector',
        tiles: [`${TILES_URL}/map_detentions/{z}/{x}/{y}`],
        minzoom: 0,
        maxzoom: 14,
      })
      map.addLayer({
        id: 'detentions-heat',
        type: 'heatmap',
        source: 'detentions',
        'source-layer': 'map_detentions',
        layout: { visibility: 'none' },
        paint: {
          'heatmap-weight': 0.5,
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 4, 0.6, 12, 2.2],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 4, 6, 9, 16, 14, 34],
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0,
            'rgba(86,98,110,0)',
            0.2,
            'rgba(86,98,110,0.16)',
            0.55,
            'rgba(86,98,110,0.36)',
            1,
            'rgba(56,69,82,0.62)',
          ],
          'heatmap-opacity': 0.9,
        },
      })

      map.addSource('incidents', {
        type: 'vector',
        tiles: [`${TILES_URL}/map_incidents/{z}/{x}/{y}`],
        minzoom: 0,
        maxzoom: 14,
      })
      const tileFilter = buildTileFilter(latest.current.filters)
      map.addLayer({
        id: 'incidents-heat',
        type: 'heatmap',
        source: 'incidents',
        'source-layer': 'map_incidents',
        filter: tileFilter,
        maxzoom: MARKS_ZOOM + 1.5,
        paint: {
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 4, 0.45, 9, 1.2],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 4, 5, 7, 11, 10, 20],
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0,
            'rgba(29,74,115,0)',
            0.12,
            'rgba(29,74,115,0.12)',
            0.4,
            'rgba(29,74,115,0.3)',
            0.75,
            'rgba(29,74,115,0.5)',
            1,
            'rgba(29,74,115,0.68)',
          ],
          'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], MARKS_ZOOM, 1, MARKS_ZOOM + 1.5, 0],
        },
      })
      map.addLayer({
        id: 'selected-ring',
        type: 'circle',
        source: 'incidents',
        'source-layer': 'map_incidents',
        filter: ['==', ['id'], latest.current.selectedId ?? NO_SELECTION],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 9, 12, 16],
          'circle-color': 'rgba(0,0,0,0)',
          'circle-stroke-color': '#15212c',
          'circle-stroke-width': 2,
        },
      })
      map.addLayer({
        id: 'incidents-marks',
        type: 'symbol',
        source: 'incidents',
        'source-layer': 'map_incidents',
        filter: tileFilter,
        minzoom: MARKS_ZOOM,
        layout: {
          'icon-image': ['concat', 'mark-', ['get', 'type'], '-', ['get', 'confidence']],
          'icon-size': ['interpolate', ['linear'], ['zoom'], MARKS_ZOOM, 0.5, 12, 0.85, 16, 1.1],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'symbol-sort-key': ['match', ['get', 'type'], 'desaparecida', 0, 1],
        },
        paint: {
          'icon-opacity': ['interpolate', ['linear'], ['zoom'], MARKS_ZOOM, 0, MARKS_ZOOM + 0.6, 1],
        },
      })

      // One generic handler, not a per-layer one: a mark click opens/moves
      // the selection, and every OTHER click on the map plate -- empty
      // water, a canton fill, a province line -- closes it (see the plan:
      // "se cierra con ×, con Esc o tocando el mapa").
      map.on('click', (event) => {
        const [feature] = map.queryRenderedFeatures(event.point, { layers: ['incidents-marks'] })
        const id = feature?.id
        const geometry = feature?.geometry
        if (typeof id === 'number' && geometry?.type === 'Point') {
          const [lon, lat] = geometry.coordinates as [number, number]
          latest.current.onSelect(id, [lon, lat])
        } else {
          latest.current.onDeselect()
        }
      })
      map.on('mouseenter', 'incidents-marks', () => (map.getCanvas().style.cursor = 'pointer'))
      map.on('mouseleave', 'incidents-marks', () => (map.getCanvas().style.cursor = ''))

      map.on('move', () => updateSelectedPoint.current())
      map.on('resize', () => updateSelectedPoint.current())

      readyRef.current = true
      emitView()
      updateSelectedPoint.current()
    })
    map.on('moveend', emitView)
    map.on('error', (event) => {
      if ((event as { sourceId?: string }).sourceId === 'base') setBaseFailed(true)
    })
    map.on('sourcedata', (event) => {
      if (event.sourceId === 'base' && event.isSourceLoaded) setBaseFailed(false)
    })

    return () => {
      readyRef.current = false
      map.remove()
      mapRef.current = null
    }
    // The map is created once; later prop changes flow through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const tileFilter = buildTileFilter(filters)
    map.setFilter('incidents-heat', tileFilter)
    map.setFilter('incidents-marks', tileFilter)
  }, [filters])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    map.setFilter('selected-ring', ['==', ['id'], selectedId ?? NO_SELECTION])
  }, [selectedId])

  // "vuelve [el foco] al mapa" (plan): once a selection that WAS open closes
  // -- Esc, the card's × button, or an empty-map click -- focus returns to
  // the map itself, never on the very first render (nothing was selected yet).
  const hadSelection = useRef(selectedId !== null)
  useEffect(() => {
    if (hadSelection.current && selectedId === null) mapRef.current?.getCanvas().focus()
    hadSelection.current = selectedId !== null
  }, [selectedId])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      map.setLayoutProperty('detentions-heat', 'visibility', showDetentions ? 'visible' : 'none')
      // Two ink heatmaps on one plate would read as one; police activity
      // replaces the incident heat while it is shown (marks stay).
      map.setLayoutProperty('incidents-heat', 'visibility', showDetentions ? 'none' : 'visible')
    }
    if (readyRef.current) apply()
    else map.once('style.load', apply)
  }, [showDetentions])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      const active = cantonLayer !== 'none'
      map.setLayoutProperty('cantons-fill', 'visibility', active ? 'visible' : 'none')
      map.setLayoutProperty('cantons-outline', 'visibility', active ? 'visible' : 'none')
      // Clear any feature-state left from a previous indicator (or from
      // before the current fetch resolves) so a switch between extorsion
      // and siniestros never briefly shows the other indicator's colors.
      map.removeFeatureState({ source: 'cantons', sourceLayer: 'map_cantons' })
      if (active) map.setPaintProperty('cantons-fill', 'fill-color', buildFillColorExpression(cantonLayer))
      // Independent of showDetentions: the canton layer only DIMS the
      // incident heatmap (never hides it), so marks/heat keep working on top.
      map.setPaintProperty(
        'incidents-heat',
        'heatmap-opacity',
        active
          ? ['interpolate', ['linear'], ['zoom'], MARKS_ZOOM, 0.35, MARKS_ZOOM + 1.5, 0]
          : ['interpolate', ['linear'], ['zoom'], MARKS_ZOOM, 1, MARKS_ZOOM + 1.5, 0],
      )
    }
    if (readyRef.current) apply()
    else map.once('style.load', apply)
  }, [cantonLayer])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current || cantonLayer === 'none') return
    for (const entry of buildFeatureStateEntries(cantonRows)) {
      map.setFeatureState({ source: 'cantons', sourceLayer: 'map_cantons', id: entry.code }, entry.state)
    }
  }, [cantonRows, cantonLayer])

  // A new selection (or its clearing) reprojects immediately, without
  // waiting for the next map move.
  useEffect(() => {
    updateSelectedPoint.current()
  }, [selectedCoordinates])

  // MapLibre's stylesheet forces position: relative on the map element, so the
  // absolute fill lives on a wrapper and the map element only fills it.
  return (
    <div className="absolute inset-0">
      <div
        ref={container}
        className="h-full w-full"
        role="region"
        aria-label="Mapa de incidentes registrados en Ecuador"
      />
      <LocateButton
        state={location}
        onClick={() => {
          if (!('geolocation' in navigator) || !window.isSecureContext) {
            setLocation('unavailable')
            return
          }
          if (location !== 'following' && location !== 'shown') setLocation('locating')
          geolocateRef.current?.trigger()
        }}
      />
      {(location === 'denied' || location === 'unavailable') && (
        <p
          role="status"
          className="absolute top-3 left-1/2 z-10 w-max max-w-[calc(100%-6rem)] -translate-x-1/2 border border-ink bg-sheet px-3 py-1.5 text-[13px]"
        >
          {location === 'denied'
            ? 'No diste permiso para usar tu ubicación. Puedes activarlo en los ajustes del navegador.'
            : 'No se pudo obtener tu ubicación en este dispositivo.'}
        </p>
      )}
      {baseFailed && (
        <p
          role="status"
          className="absolute top-3 left-1/2 z-10 w-max max-w-[calc(100%-6rem)] -translate-x-1/2 border border-ink bg-sheet px-3 py-1.5 text-[13px]"
        >
          No se pudo cargar el mapa base. Los casos se muestran igual.
        </p>
      )}
    </div>
  )
}

const LOCATE_LABEL = {
  off: 'Mi ubicación',
  locating: 'Buscando tu ubicación…',
  following: 'Siguiendo tu ubicación',
  shown: 'Volver a mi ubicación',
  denied: 'Mi ubicación',
  unavailable: 'Mi ubicación',
} as const

function LocateButton({ state, onClick }: { state: keyof typeof LOCATE_LABEL; onClick: () => void }) {
  const active = state === 'following'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`absolute top-[86px] right-2.5 z-10 flex h-8 items-center gap-2 border border-ink px-2.5 text-[13px] font-medium transition-colors duration-150 ${
        active ? 'bg-sello text-paper' : 'bg-sheet text-ink hover:bg-sello-soft'
      }`}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className={state === 'locating' ? 'animate-pulse' : ''}>
        <circle cx="8" cy="8" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="8" cy="8" r="1.6" fill="currentColor" />
        <path d="M8 0.8v2.6M8 12.6v2.6M0.8 8h2.6M12.6 8h2.6" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      {LOCATE_LABEL[state]}
    </button>
  )
}
