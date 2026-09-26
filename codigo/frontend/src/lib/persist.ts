import type { MapView } from '../components/IncidentMap'
import type { Filters } from './registry'

/** The last consultation, restored on return. Browser storage may be unavailable. */
export interface SavedView {
  filters: Filters
  map: MapView
  selectedId: number | null
}

const KEY = 'reporteec:consulta:v1'

export function loadSavedView(): SavedView | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as SavedView) : null
  } catch {
    return null
  }
}

export function saveView(view: SavedView) {
  try {
    localStorage.setItem(KEY, JSON.stringify(view))
  } catch {
    // Private mode or blocked storage: the page works without it.
  }
}

export function clearSavedView() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing to clear.
  }
}
