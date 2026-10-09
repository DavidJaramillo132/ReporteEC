/**
 * The route ends, drawn the same in the fields, the legend and on the map
 * (see endpointElement in RouteMap): «A» on sheet for the origin, «B» on ink
 * for the destination. Square, like every other control (DESIGN.md).
 */
export function EndpointMark({ role, size = 20 }: { role: 'origin' | 'destination'; size?: number }) {
  const origin = role === 'origin'
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center border-2 border-ink font-bold leading-none ${
        origin ? 'bg-sheet text-ink' : 'bg-ink text-paper'
      }`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.6) }}
    >
      {origin ? 'A' : 'B'}
    </span>
  )
}

/** A blackspot's number, shared by its card and its map mark. */
export function BlackspotNumber({ n }: { n: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-6 shrink-0 items-center justify-center border border-ink bg-paper-deep text-[12.5px] font-bold text-ink tabular-nums"
    >
      {n}
    </span>
  )
}
