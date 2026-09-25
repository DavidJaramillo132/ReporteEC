import type { FeatureCollection, Point } from 'geojson'
import {
  AttributionControl,
  GeolocateControl,
  type GeoJSONSource,
  type LngLatBoundsLike,
  Map as MapLibreMap,
  NavigationControl,
  ScaleControl,
} from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'
import { ECUADOR_BOUNDS, gazetteBasemap } from '../lib/basemap'
import { buildMarkImages } from '../lib/marks'
import type { Incident } from '../lib/registry'

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

export interface FocusRequest {
  id: string
  coordinates: [number, number]
  nonce: number
}

interface IncidentMapProps {
  incidents: Incident[]
  showDetentions: boolean
  selectedId: string | null
  initialView: MapView | null
  focus: FocusRequest | null
  onSelect: (id: string) => void
  onViewChange: (bounds: ViewBounds, view: MapView) => void
  onDetentionsLoaded?: (ok: boolean) => void
}

/** Zoom at which the ink heatmap hands over to individual registry marks. */
export const MARKS_ZOOM = 8.5

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] }

function toSourceData(incidents: Incident[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: incidents.map((i) => ({ ...i, properties: { ...i.properties, rid: i.id } })),
  }
}

export function IncidentMap({
  incidents,
  showDetentions,
  selectedId,
  initialView,
  focus,
  onSelect,
  onViewChange,
  onDetentionsLoaded,
}: IncidentMapProps) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const readyRef = useRef(false)
  const detentionsRequested = useRef(false)
  const [baseFailed, setBaseFailed] = useState(false)
  const geolocateRef = useRef<GeolocateControl | null>(null)
  const [location, setLocation] = useState<'off' | 'locating' | 'following' | 'shown' | 'denied' | 'unavailable'>('off')
  // Latest props for handlers bound once at map creation.
  const latest = useRef({ incidents, onSelect, onViewChange, selectedId })
  useEffect(() => {
    latest.current = { incidents, onSelect, onViewChange, selectedId }
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

      map.addSource('detentions', { type: 'geojson', data: EMPTY })
      map.addLayer({
        id: 'detentions-heat',
        type: 'heatmap',
        source: 'detentions',
        layout: { visibility: 'none' },
        paint: {
          'heatmap-weight': ['interpolate', ['linear'], ['get', 'n'], 1, 0.3, 20, 1],
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

      map.addSource('incidents', { type: 'geojson', data: toSourceData(latest.current.incidents) })
      map.addLayer({
        id: 'incidents-heat',
        type: 'heatmap',
        source: 'incidents',
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
        filter: ['==', ['get', 'rid'], latest.current.selectedId ?? ''],
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
        minzoom: MARKS_ZOOM,
        layout: {
          'icon-image': ['concat', 'mark-', ['get', 'tipo'], '-', ['get', 'confianza']],
          'icon-size': ['interpolate', ['linear'], ['zoom'], MARKS_ZOOM, 0.5, 12, 0.85, 16, 1.1],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'symbol-sort-key': ['match', ['get', 'tipo'], 'desaparecida', 0, 1],
        },
        paint: {
          'icon-opacity': ['interpolate', ['linear'], ['zoom'], MARKS_ZOOM, 0, MARKS_ZOOM + 0.6, 1],
        },
      })

      map.on('click', 'incidents-marks', (event) => {
        const rid = event.features?.[0]?.properties?.rid
        if (typeof rid === 'string') latest.current.onSelect(rid)
      })
      map.on('mouseenter', 'incidents-marks', () => (map.getCanvas().style.cursor = 'pointer'))
      map.on('mouseleave', 'incidents-marks', () => (map.getCanvas().style.cursor = ''))

      readyRef.current = true
      emitView()
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
    ;(map.getSource('incidents') as GeoJSONSource | undefined)?.setData(toSourceData(incidents))
  }, [incidents])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    map.setFilter('selected-ring', ['==', ['get', 'rid'], selectedId ?? ''])
  }, [selectedId])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      map.setLayoutProperty('detentions-heat', 'visibility', showDetentions ? 'visible' : 'none')
      // Two ink heatmaps on one plate would read as one; police activity
      // replaces the incident heat while it is shown (marks stay).
      map.setLayoutProperty('incidents-heat', 'visibility', showDetentions ? 'none' : 'visible')
      if (showDetentions && !detentionsRequested.current) {
        detentionsRequested.current = true
        fetch('/data/detenidos-2026.geojson')
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
          .then((data: FeatureCollection) => {
            ;(map.getSource('detentions') as GeoJSONSource | undefined)?.setData(data)
            onDetentionsLoaded?.(true)
          })
          .catch(() => {
            detentionsRequested.current = false
            onDetentionsLoaded?.(false)
          })
      }
    }
    if (readyRef.current) apply()
    else map.once('style.load', apply)
  }, [showDetentions, onDetentionsLoaded])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !focus) return
    map.flyTo({
      center: focus.coordinates,
      zoom: Math.max(map.getZoom(), 12.5),
      duration: 1100,
      curve: 1.3,
      essential: true,
    })
  }, [focus])

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
