import type { GeolocateControl } from 'maplibre-gl'
import { useCallback, useRef, useState } from 'react'

export type LocateState = 'off' | 'locating' | 'following' | 'shown' | 'denied' | 'unavailable'

/**
 * State for the labeled "Mi ubicación" button. `bind` hooks a map's
 * GeolocateControl (call it once, where the map is created); `trigger` is
 * the button's click. The position stays in the browser.
 */
export function useLocate() {
  const [location, setLocation] = useState<LocateState>('off')
  const geolocateRef = useRef<GeolocateControl | null>(null)

  const bind = useCallback((geolocate: GeolocateControl) => {
    geolocateRef.current = geolocate
    geolocate.on('trackuserlocationstart', () => setLocation('following'))
    geolocate.on('trackuserlocationend', () => setLocation((s) => (s === 'following' ? 'shown' : s)))
    geolocate.on('geolocate', () => setLocation((s) => (s === 'locating' ? 'following' : s)))
    geolocate.on('error', (event) => setLocation(event.code === 1 ? 'denied' : 'unavailable'))
  }, [])

  const trigger = useCallback(() => {
    if (!('geolocation' in navigator) || !window.isSecureContext) {
      setLocation('unavailable')
      return
    }
    setLocation((s) => (s !== 'following' && s !== 'shown' ? 'locating' : s))
    geolocateRef.current?.trigger()
  }, [])

  return { location, bind, trigger }
}
