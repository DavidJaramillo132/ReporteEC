import {
  AttributionControl,
  GeolocateControl,
  type LngLatBoundsLike,
  Map as MapLibreMap,
  type MapOptions,
  NavigationControl,
  ScaleControl,
} from 'maplibre-gl'
import { gazetteBasemap } from './basemap'

/** Where a new map starts: a saved center/zoom, or bounds to fit. */
export type GazetteView =
  | { center: [number, number]; zoom: number }
  | { bounds: LngLatBoundsLike; fitBoundsOptions?: MapOptions['fitBoundsOptions'] }

/**
 * The map every page shares: the gazette basemap, no rotation, square-cornered
 * zoom buttons (top-right), scale and attribution (bottom-right), and a
 * GeolocateControl whose own icon is hidden in CSS -- the labeled
 * "Mi ubicación" button (components/LocateButton.tsx) drives it instead.
 * Data layers are each page's own business.
 */
export function createGazetteMap(container: HTMLElement, view: GazetteView): { map: MapLibreMap; geolocate: GeolocateControl } {
  const map = new MapLibreMap({
    container,
    style: gazetteBasemap(),
    ...view,
    minZoom: 4,
    maxZoom: 17,
    attributionControl: false,
    dragRotate: false,
    pitchWithRotate: false,
  })
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
  map.addControl(geolocate, 'top-right')
  return { map, geolocate }
}

/** Calls `onChange(true)` when the basemap's tiles fail and `onChange(false)` once they load again. */
export function watchBasemap(map: MapLibreMap, onChange: (failed: boolean) => void): void {
  map.on('error', (event) => {
    if ((event as { sourceId?: string }).sourceId === 'base') onChange(true)
  })
  map.on('sourcedata', (event) => {
    if (event.sourceId === 'base' && event.isSourceLoaded) onChange(false)
  })
}
