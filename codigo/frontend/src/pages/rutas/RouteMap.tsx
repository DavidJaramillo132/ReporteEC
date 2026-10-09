import { type GeoJSONSource, LngLatBounds, type LngLatBoundsLike, type Map as MapLibreMap, Marker } from 'maplibre-gl'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { LocateButton, LocateNotice, MapNotice } from '../../components/LocateButton'
import { useLocate } from '../../components/useLocate'
import type { Blackspot, LonLatPoint } from '../../lib/api'
import { ECUADOR_BOUNDS } from '../../lib/basemap'
import { SELLO } from '../../lib/charts'
import { createGazetteMap, watchBasemap } from '../../lib/gazetteMap'
import { INK, PAPER } from '../../lib/marks'
import { blackspotLabel } from '../../lib/routeRisk'

interface RouteMapProps {
  from: LonLatPoint | null
  to: LonLatPoint | null
  /** The route's display LineString, or null with no route on screen. */
  line: [number, number][] | null
  blackspots: Blackspot[]
  /** Which end the next map click sets, if any. */
  picking: 'origin' | 'destination' | null
  onPick: (point: LonLatPoint) => void
  /** Centers the map on a blackspot when its card asks; `seq` repeats a request for the same one. */
  focus: { lon: number; lat: number; seq: number } | null
  children?: ReactNode
}

interface LineFeature {
  type: 'Feature'
  properties: Record<string, never>
  geometry: { type: 'LineString'; coordinates: [number, number][] }
}

const EMPTY_LINE: LineFeature = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } }

function lineFeature(coordinates: [number, number][] | null): LineFeature {
  return coordinates ? { ...EMPTY_LINE, geometry: { type: 'LineString', coordinates } } : EMPTY_LINE
}

/** Keeps the route clear of the zoom/«Mi ubicación» controls (right) and the attribution (bottom). */
function fitPadding() {
  return window.matchMedia('(min-width: 1024px)').matches
    ? { top: 56, bottom: 64, left: 56, right: 150 }
    : { top: 40, bottom: 64, left: 32, right: 56 }
}

function moveDuration() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 600
}

/** The DOM for an end's map mark: the same square as EndpointMark. */
function endpointElement(role: 'origin' | 'destination'): HTMLElement {
  const el = document.createElement('div')
  const origin = role === 'origin'
  el.textContent = origin ? 'A' : 'B'
  el.setAttribute('role', 'img')
  el.setAttribute('aria-label', origin ? 'Origen' : 'Destino')
  Object.assign(el.style, {
    width: '24px',
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: `2px solid ${INK}`,
    background: origin ? PAPER : INK,
    color: origin ? INK : PAPER,
    font: '700 14px/1 var(--font-sans)',
    pointerEvents: 'none',
  })
  return el
}

/** The DOM for a blackspot's map mark: its card's number on a recessed square. */
function blackspotElement(n: number, spot: Blackspot): HTMLElement {
  const el = document.createElement('div')
  el.textContent = String(n)
  el.setAttribute('role', 'img')
  el.setAttribute('aria-label', `Tramo ${n}: ${blackspotLabel(spot)}`)
  el.title = `Tramo ${n}: ${blackspotLabel(spot)}`
  Object.assign(el.style, {
    width: '22px',
    height: '22px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: `1px solid ${INK}`,
    background: '#dfe6e3',
    color: INK,
    font: '700 12.5px/1 var(--font-sans)',
    fontVariantNumeric: 'tabular-nums',
  })
  return el
}

/**
 * The Rutas map: the shared gazette map (lib/gazetteMap.ts) plus the route
 * line in sello over a sheet casing, the A/B ends and the numbered blackspot
 * marks. A new route fits the view; while `picking` is set the next click
 * becomes that end.
 */
export function RouteMap({ from, to, line, blackspots, picking, onPick, focus, children }: RouteMapProps) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const [ready, setReady] = useState(false)
  const [baseFailed, setBaseFailed] = useState(false)
  const { location, bind: bindLocate, trigger: triggerLocate } = useLocate()
  const latest = useRef({ picking, onPick })
  useEffect(() => {
    latest.current = { picking, onPick }
  })

  useEffect(() => {
    if (!container.current) return
    const { map, geolocate } = createGazetteMap(container.current, {
      bounds: ECUADOR_BOUNDS as LngLatBoundsLike,
      fitBoundsOptions: { padding: 16 },
    })
    mapRef.current = map
    bindLocate(geolocate)
    watchBasemap(map, setBaseFailed)

    map.once('style.load', () => {
      map.addSource('route', { type: 'geojson', data: EMPTY_LINE })
      map.addLayer({
        id: 'route-case',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': PAPER, 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 5, 12, 9] },
      })
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': SELLO, 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 2.5, 12, 5] },
      })
      setReady(true)
    })

    map.on('click', (event) => {
      if (!latest.current.picking) return
      latest.current.onPick({ lon: event.lngLat.lng, lat: event.lngLat.lat })
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
    // The map is created once; later prop changes flow through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The route line, and a fitted view for every new one.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    ;(map.getSource('route') as GeoJSONSource | undefined)?.setData(lineFeature(line))
    if (!line || line.length < 2) return
    const bounds = line.reduce((b, coord) => b.extend(coord), new LngLatBounds(line[0], line[0]))
    map.fitBounds(bounds, { padding: fitPadding(), maxZoom: 14, duration: moveDuration() })
  }, [line, ready])

  // A/B marks: shown as soon as an end is chosen, before any route exists.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const markers: Marker[] = []
    if (from) markers.push(new Marker({ element: endpointElement('origin') }).setLngLat([from.lon, from.lat]).addTo(map))
    if (to) markers.push(new Marker({ element: endpointElement('destination') }).setLngLat([to.lon, to.lat]).addTo(map))
    return () => markers.forEach((m) => m.remove())
  }, [from, to])

  // Without a route on screen (one end only, loading, or an error), keep the chosen ends in view.
  const hasLine = Boolean(line && line.length >= 2)
  useEffect(() => {
    const map = mapRef.current
    if (!map || hasLine) return
    if (from && to) {
      const bounds = new LngLatBounds([from.lon, from.lat], [from.lon, from.lat]).extend([to.lon, to.lat])
      map.fitBounds(bounds, { padding: fitPadding(), maxZoom: 11, duration: moveDuration() })
      return
    }
    const only = from ?? to
    if (only && !map.getBounds().contains([only.lon, only.lat])) {
      map.easeTo({ center: [only.lon, only.lat], zoom: Math.max(map.getZoom(), 8), duration: moveDuration() })
    }
  }, [from, to, hasLine])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const markers = blackspots.map((spot, i) => new Marker({ element: blackspotElement(i + 1, spot) }).setLngLat([spot.lon, spot.lat]).addTo(map))
    return () => markers.forEach((m) => m.remove())
  }, [blackspots])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !focus) return
    map.easeTo({ center: [focus.lon, focus.lat], zoom: Math.max(map.getZoom(), 12), duration: moveDuration() })
  }, [focus])

  useEffect(() => {
    const canvas = mapRef.current?.getCanvas()
    if (canvas) canvas.style.cursor = picking ? 'crosshair' : ''
  }, [picking])

  return (
    <div className="absolute inset-0">
      <div
        ref={container}
        className="h-full w-full"
        role="region"
        aria-label={picking ? `Mapa: toca un punto para elegir el ${picking === 'origin' ? 'origen' : 'destino'}` : 'Mapa de la ruta'}
      />
      <LocateButton state={location} onClick={triggerLocate} />
      <LocateNotice state={location} />
      {baseFailed && <MapNotice>No se pudo cargar el mapa base. La ruta se muestra igual.</MapNotice>}
      {children}
    </div>
  )
}
