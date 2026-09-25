import { FIRST_YEAR, MONTHS } from '../lib/registry'

interface TimeRuleProps {
  year: number
  months: number[]
  /** Years present in the loaded data. */
  availableYears: number[]
  /** Last month with published data in the active year (1–12). */
  lastMonth: number
  onYear: (year: number) => void
  onMonths: (months: number[]) => void
}

/**
 * The one moving axis of the page: a ruled scale of years with a band on the
 * active cut, and the months of that year beneath it.
 */
export function TimeRule({ year, months, availableYears, lastMonth, onYear, onMonths }: TimeRuleProps) {
  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: currentYear - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i)
  const published = Array.from({ length: lastMonth }, (_, i) => i + 1)
  const allSelected = published.every((m) => months.includes(m))

  const toggleMonth = (m: number) => {
    const next = months.includes(m) ? months.filter((x) => x !== m) : [...months, m].sort((a, b) => a - b)
    onMonths(next.length ? next : published)
  }

  return (
    <div className="border-t border-ink bg-paper px-4 py-2.5 lg:px-6">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <fieldset className="flex min-w-0 max-w-full items-center">
          <legend className="label mr-3 float-left leading-8 text-ink-3">Año</legend>
          <div className="flex min-w-0 overflow-x-auto border border-ink">
            {years.map((y) => {
              const available = availableYears.includes(y)
              const active = y === year
              return (
                <button
                  key={y}
                  type="button"
                  disabled={!available}
                  aria-pressed={active}
                  title={available ? undefined : 'Sin datos en esta muestra; se cargará con la ingesta completa'}
                  onClick={() => onYear(y)}
                  className={`h-8 min-w-12 shrink-0 border-r border-ink px-2 text-[13px] tabular-nums last:border-r-0 transition-colors duration-150 ${
                    active
                      ? 'bg-sello font-semibold text-paper'
                      : available
                        ? 'hover:bg-sheet'
                        : 'hatch cursor-not-allowed text-ink-3'
                  }`}
                >
                  {y}
                </button>
              )
            })}
          </div>
        </fieldset>

        <fieldset className="flex min-w-0 max-w-full items-center">
          <legend className="label mr-3 float-left leading-8 text-ink-3">Meses</legend>
          <div className="flex min-w-0 overflow-x-auto border border-ink">
            {MONTHS.map((name, i) => {
              const m = i + 1
              const available = m <= lastMonth
              const active = months.includes(m)
              return (
                <button
                  key={name}
                  type="button"
                  disabled={!available}
                  aria-pressed={available && active}
                  title={available ? undefined : 'Aún no publicado por la fuente'}
                  onClick={() => toggleMonth(m)}
                  className={`h-8 w-11 shrink-0 border-r border-ink text-[13px] last:border-r-0 transition-colors duration-150 ${
                    !available
                      ? 'hatch cursor-not-allowed text-ink-3'
                      : active
                        ? 'bg-sello text-paper'
                        : 'text-ink-2 hover:bg-sheet'
                  }`}
                >
                  {name}
                </button>
              )
            })}
          </div>
          {!allSelected && (
            <button
              type="button"
              onClick={() => onMonths(published)}
              className="ml-3 text-[13px] underline underline-offset-3 hover:no-underline"
            >
              Todos los meses
            </button>
          )}
        </fieldset>
      </div>
    </div>
  )
}
