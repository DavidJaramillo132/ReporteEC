import type { ReactNode } from 'react'
import type { LocateState } from './useLocate'

const LOCATE_LABEL: Record<LocateState, string> = {
  off: 'Mi ubicación',
  locating: 'Buscando tu ubicación…',
  following: 'Siguiendo tu ubicación',
  shown: 'Volver a mi ubicación',
  denied: 'Mi ubicación',
  unavailable: 'Mi ubicación',
}

/** The labeled "Mi ubicación" button, pinned under the zoom controls (see useLocate). */
export function LocateButton({ state, onClick }: { state: LocateState; onClick: () => void }) {
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

/** A centered notice over the map plate (location problems, basemap failures, page hints). */
export function MapNotice({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="absolute top-3 left-1/2 z-10 w-max max-w-[calc(100%-6rem)] -translate-x-1/2 border border-ink bg-sheet px-3 py-1.5 text-[13px]"
    >
      {children}
    </p>
  )
}

/** The location notice for a denied or unavailable position; nothing otherwise. */
export function LocateNotice({ state }: { state: LocateState }) {
  if (state !== 'denied' && state !== 'unavailable') return null
  return (
    <MapNotice>
      {state === 'denied'
        ? 'No diste permiso para usar tu ubicación. Puedes activarlo en los ajustes del navegador.'
        : 'No se pudo obtener tu ubicación en este dispositivo.'}
    </MapNotice>
  )
}
