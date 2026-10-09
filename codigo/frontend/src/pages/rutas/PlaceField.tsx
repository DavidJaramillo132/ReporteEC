import { useId, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { LonLatPoint, Place } from '../../lib/api'
import { placeName } from '../../lib/registry'
import { nextActiveIndex, placeLabel, roundPoint } from '../../lib/routeRisk'
import { EndpointMark } from './EndpointMark'
import { MIN_QUERY, usePlaceSearch } from './usePlaceSearch'

export interface Endpoint {
  point: LonLatPoint
  /** What the field shows: a canton («Durán, Guayas») or «Punto en el mapa (…)». */
  label: string
}

interface PlaceFieldProps {
  role: 'origin' | 'destination'
  value: Endpoint | null
  onChoose: (endpoint: Endpoint) => void
  /** True while the next map click sets this end. */
  picking: boolean
  onTogglePicking: () => void
}

const COPY = {
  origin: { label: 'Origen', placeholder: 'Escribe un cantón, p. ej. Guayaquil' },
  destination: { label: 'Destino', placeholder: 'Escribe un cantón, p. ej. Quito' },
} as const

/**
 * One route end: an ARIA 1.2 combobox over the canton search (list
 * autocomplete, arrows/Home/End move, Enter picks, Esc closes then restores,
 * 250 ms debounce in usePlaceSearch), plus «Elegir en el mapa», which arms
 * the next map click for this end. The text shows the chosen end until the
 * reader types; typing never clears the chosen point until another is picked.
 */
export function PlaceField({ role, value, onChoose, picking, onTogglePicking }: PlaceFieldProps) {
  const copy = COPY[role]
  const baseId = useId()
  const inputId = `${baseId}-input`
  const listId = `${baseId}-list`
  const statusId = `${baseId}-status`

  // null = not editing: the field shows the chosen end's label.
  const [draft, setDraft] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)

  const text = draft ?? value?.label ?? ''
  // Searches follow the typed text even while the list is closed, so arrows can reopen it on results.
  const search = usePlaceSearch(draft ?? '')
  const places = search.status === 'ready' ? search.places : []
  // The search is "open" while the reader edits; the listbox itself is shown (and aria-expanded true)
  // only when it has options -- loading, too-short and no-result states live in the status line.
  const listShown = open && draft !== null && draft.trim().length > 0
  const popupShown = listShown && places.length > 0
  const activeIndex = active < places.length ? active : -1

  const choose = (place: Place) => {
    // Rounded like a shared link's ends, so both send the same request (and hit the API's cache).
    onChoose({ point: roundPoint({ lon: place.lon, lat: place.lat }), label: placeLabel(place) })
    setDraft(null)
    setOpen(false)
    setActive(-1)
  }

  const close = () => {
    setOpen(false)
    setActive(-1)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      // Nothing typed (the field shows the chosen end): there is nothing to search, so nothing opens.
      // With typed text, the arrows reopen the list on that text's last results.
      if (draft === null) return
      event.preventDefault()
      if (!open) setOpen(true)
      setActive((current) => nextActiveIndex(current < places.length ? current : -1, places.length, event.key))
    } else if ((event.key === 'Home' || event.key === 'End') && popupShown && activeIndex >= 0) {
      event.preventDefault()
      setActive((current) => nextActiveIndex(current, places.length, event.key))
    } else if (event.key === 'Enter') {
      if (popupShown && activeIndex >= 0) {
        event.preventDefault()
        choose(places[activeIndex])
      } else if (popupShown && places.length === 1) {
        event.preventDefault()
        choose(places[0])
      }
    } else if (event.key === 'Escape') {
      if (listShown) {
        event.preventDefault()
        event.stopPropagation()
        close()
      } else if (draft !== null) {
        event.preventDefault()
        event.stopPropagation()
        setDraft(null)
      }
    }
  }

  const statusText = !listShown
    ? ''
    : search.status === 'short'
      ? `Escribe al menos ${MIN_QUERY} letras.`
      : search.status === 'loading'
        ? 'Buscando…'
        : search.status === 'error'
          ? 'No se pudo buscar. Intenta de nuevo.'
          : places.length === 0
            ? `No hay cantones que coincidan con «${draft?.trim()}».`
            : `${places.length} ${places.length === 1 ? 'resultado' : 'resultados'}. Usa las flechas para elegir.`

  return (
    <div className="relative min-w-0">
      <div className="flex items-end justify-between gap-2">
        <label htmlFor={inputId} className="label flex items-center gap-1.5 text-ink-3">
          <EndpointMark role={role} size={16} />
          {copy.label}
        </label>
        <button
          type="button"
          aria-pressed={picking}
          onClick={onTogglePicking}
          className={`flex h-7 items-center gap-1.5 border px-2 text-[12.5px] font-medium transition-colors duration-150 ${
            picking ? 'border-sello bg-sello text-paper' : 'border-transparent text-ink-2 underline decoration-ink-3 underline-offset-2 hover:text-sello'
          }`}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M6 0.5v3M6 8.5v3M0.5 6h3M8.5 6h3" stroke="currentColor" strokeWidth="1.4" />
            <rect x="4" y="4" width="4" height="4" fill="currentColor" />
          </svg>
          Elegir en el mapa
          {/* One stable name per field; aria-pressed carries the armed state. */}
          <span className="sr-only"> ({copy.label.toLowerCase()})</span>
        </button>
      </div>
      <input
        id={inputId}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={popupShown}
        aria-controls={listId}
        aria-activedescendant={popupShown && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        aria-describedby={statusId}
        autoComplete="off"
        spellCheck={false}
        placeholder={copy.placeholder}
        value={text}
        onChange={(event) => {
          setDraft(event.target.value)
          setOpen(true)
          setActive(-1)
        }}
        onFocus={(event) => event.target.select()}
        onBlur={() => {
          close()
          setDraft(null)
        }}
        onKeyDown={onKeyDown}
        className="mt-1 h-9 w-full min-w-0 border border-ink bg-sheet px-2.5 text-[14.5px] text-ink placeholder:text-ink-3 focus-visible:outline-offset-0"
      />
      <ul
        id={listId}
        role="listbox"
        aria-label={`Cantones para ${copy.label.toLowerCase()}`}
        hidden={!popupShown}
        className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto border border-ink bg-sheet shadow-[0_6px_18px_-8px_rgba(21,33,44,0.35)]"
      >
        {places.map((place, index) => (
          <li
            key={place.code}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={index === activeIndex}
            // Keep focus in the input: a press must not blur it before the click lands.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(place)}
            onPointerMove={() => setActive(index)}
            className={`flex cursor-pointer items-baseline justify-between gap-3 border-b border-rule-soft px-2.5 py-1.5 text-[14px] last:border-b-0 ${
              index === activeIndex ? 'bg-sello text-paper' : 'text-ink'
            }`}
          >
            <span className="truncate">{placeName(place.name)}</span>
            {place.province_name && (
              <span className={`shrink-0 text-[12.5px] ${index === activeIndex ? 'text-paper/80' : 'text-ink-3'}`}>
                {placeName(place.province_name)}
              </span>
            )}
          </li>
        ))}
      </ul>
      <p
        id={statusId}
        aria-live="polite"
        className={
          listShown && places.length === 0
            ? 'absolute inset-x-0 top-full z-30 mt-1 border border-ink bg-sheet px-2.5 py-1.5 text-[13px] text-ink-2'
            : 'sr-only'
        }
      >
        {statusText}
      </p>
    </div>
  )
}
