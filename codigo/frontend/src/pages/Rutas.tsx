import { useCallback, useEffect, useId, useState } from 'react'
import type { LonLatPoint } from '../lib/api'
import { replaceQuery } from '../lib/router'
import {
  HOURS,
  guayaquilHour,
  hourLabel,
  parseRouteSearch,
  pointLabel,
  roundPoint,
  routeToSearch,
} from '../lib/routeRisk'
import { PlaceField, type Endpoint } from './rutas/PlaceField'
import { HonestyNote, RiskPanel } from './rutas/RiskPanel'
import { RouteMap } from './rutas/RouteMap'
import { useRouteRisk } from './rutas/useRouteRisk'

type EndRole = 'origin' | 'destination'

function endpointAt(point: LonLatPoint): Endpoint {
  const rounded = roundPoint(point)
  return { point: rounded, label: pointLabel(rounded) }
}

/** Read once, on mount: a shared link restores both ends and the hour, and fetches. */
function initialState() {
  const url = parseRouteSearch(window.location.search)
  return {
    from: url.from ? endpointAt(url.from) : null,
    to: url.to ? endpointAt(url.to) : null,
    hour: url.hour ?? guayaquilHour(),
  }
}

/**
 * Route risk by hour of day: `/rutas`. Pick an origin and a destination
 * (canton search or a map click), and a departure hour; the page shows the
 * route, its semáforo for that hour, the 24-hour curve, the best hour to
 * leave and up to five blackspots. State lives in the URL
 * (`?desde=lon,lat&hasta=lon,lat&hora=H`, see lib/routeRisk.ts). Changing
 * only the hour never refetches: the response already has all 24 hours.
 */
export function Rutas() {
  useEffect(() => {
    document.title = 'Rutas · ReporteEC'
  }, [])

  const [initial] = useState(initialState)
  const [from, setFrom] = useState<Endpoint | null>(initial.from)
  const [to, setTo] = useState<Endpoint | null>(initial.to)
  const [hour, setHour] = useState(initial.hour)
  const [picking, setPicking] = useState<EndRole | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [focus, setFocus] = useState<{ lon: number; lat: number; seq: number } | null>(null)
  const hourId = useId()

  const result = useRouteRisk(from?.point ?? null, to?.point ?? null, hour, attempt)
  const data = result.status === 'ready' ? result.data : null

  useEffect(() => {
    replaceQuery(routeToSearch({ from: from?.point ?? null, to: to?.point ?? null, hour }))
  }, [from, to, hour])

  // Esc cancels «Elegir en el mapa» wherever focus is.
  useEffect(() => {
    if (!picking) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPicking(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [picking])

  const handlePick = useCallback(
    (point: LonLatPoint) => {
      if (picking === 'origin') setFrom(endpointAt(point))
      if (picking === 'destination') setTo(endpointAt(point))
      setPicking(null)
    },
    [picking],
  )

  const togglePicking = (role: EndRole) => setPicking((current) => (current === role ? null : role))

  const swap = () => {
    setFrom(to)
    setTo(from)
  }

  return (
    <div className="grid flex-1 grid-cols-1 lg:min-h-0 lg:grid-cols-[minmax(360px,420px)_minmax(0,1fr)] lg:grid-rows-[auto_minmax(0,1fr)]">
      <h1 className="sr-only">Riesgo en rutas según la hora de salida</h1>

      <section aria-label="Ruta" className="border-b border-ink bg-paper px-4 py-4 lg:col-start-1 lg:row-start-1 lg:border-r lg:px-5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-3">
          <div className="col-start-1">
            <PlaceField
              role="origin"
              value={from}
              onChoose={setFrom}
              picking={picking === 'origin'}
              onTogglePicking={() => togglePicking('origin')}
            />
          </div>
          <button
            type="button"
            onClick={swap}
            disabled={!from && !to}
            aria-label="Intercambiar origen y destino"
            title="Intercambiar origen y destino"
            className={`col-start-2 row-span-2 row-start-1 mt-5 flex size-9 items-center justify-center border border-ink transition-colors duration-150 ${
              from || to ? 'bg-sheet text-ink hover:bg-sello hover:text-paper' : 'hatch cursor-not-allowed text-ink-3'
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M5 2v11M2 10l3 3 3-3M11 14V3M8 6l3-3 3 3" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
          <div className="col-start-1">
            <PlaceField
              role="destination"
              value={to}
              onChoose={setTo}
              picking={picking === 'destination'}
              onTogglePicking={() => togglePicking('destination')}
            />
          </div>
        </div>

        <div className="mt-4 flex h-8 w-max max-w-full items-center border border-ink bg-sheet text-[13px]">
          <label htmlFor={hourId} className="label border-r border-ink px-2 leading-[30px] text-ink">
            Hora de salida
          </label>
          <select
            id={hourId}
            value={hour}
            onChange={(event) => setHour(Number(event.target.value))}
            className="h-full cursor-pointer bg-transparent pr-2 pl-2 tabular-nums"
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
              </option>
            ))}
          </select>
        </div>
      </section>

      <div className="relative h-[55svh] min-h-[320px] border-b border-ink lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:h-auto lg:min-h-0 lg:border-b-0">
        <RouteMap
          from={from?.point ?? null}
          to={to?.point ?? null}
          line={data?.geometry.coordinates ?? null}
          blackspots={data?.blackspots ?? NO_BLACKSPOTS}
          picking={picking}
          onPick={handlePick}
          focus={focus}
        >
          {picking && (
            <div className="ink-in absolute top-3 left-3 z-10 flex max-w-[calc(100%-1.5rem-140px)] flex-wrap items-center gap-x-3 gap-y-1 border border-ink bg-sheet px-3 py-1.5 text-[13px]">
              <span role="status">Toca el mapa para marcar el {picking === 'origin' ? 'origen' : 'destino'}.</span>
              <button type="button" onClick={() => setPicking(null)} className="underline hover:no-underline">
                Cancelar (Esc)
              </button>
            </div>
          )}
        </RouteMap>
      </div>

      <section aria-label="Resultado" aria-busy={result.status === 'loading'} className="bg-paper px-4 py-5 lg:col-start-1 lg:row-start-2 lg:overflow-y-auto lg:border-r lg:border-ink lg:px-5">
        {result.status === 'idle' && (
          <div className="space-y-5">
            <div className="text-[14.5px] text-ink-2">
              <p className="text-[16px] font-semibold text-ink">¿A qué hora conviene salir?</p>
              <p className="mt-1">
                Elige un origen y un destino: escribe el nombre de un cantón o márcalos en el mapa. Verás cuántas muertes
                violentas se registraron cerca de la ruta y a qué horas del día ocurrieron.
              </p>
            </div>
            <HonestyNote />
          </div>
        )}

        {result.status === 'loading' && (
          <div className="space-y-4">
            <p role="status" className="text-[14px] text-ink-2">
              Calculando la ruta…
            </p>
            <div aria-hidden="true" className="space-y-3">
              <div className="hatch h-24 border border-rule-soft" />
              <div className="hatch h-12 border border-rule-soft" />
              <div className="hatch h-40 border border-rule-soft" />
            </div>
          </div>
        )}

        {result.status === 'error' && (
          <div className="space-y-5">
            <div role="alert" className="border border-ink bg-sheet p-4 text-[14px]">
              <p className="font-semibold">{result.message}</p>
              {(result.kind === 'invalid' || result.kind === 'not-found') && (
                <p className="mt-1 text-[13.5px] text-ink-2">Prueba con otro origen o destino.</p>
              )}
              {(result.kind === 'unavailable' || result.kind === 'failed') && (
                <button
                  type="button"
                  onClick={() => setAttempt((n) => n + 1)}
                  className="mt-3 border border-ink px-3 py-1 text-[13px] font-medium hover:bg-sello hover:text-paper"
                >
                  Reintentar
                </button>
              )}
            </div>
            <HonestyNote />
          </div>
        )}

        {data && (
          <RiskPanel
            data={data}
            hour={hour}
            onHour={setHour}
            onFocusBlackspot={(index) => {
              const spot = data.blackspots[index]
              if (spot) setFocus((current) => ({ lon: spot.lon, lat: spot.lat, seq: (current?.seq ?? 0) + 1 }))
            }}
          />
        )}
      </section>
    </div>
  )
}

const NO_BLACKSPOTS: never[] = []
