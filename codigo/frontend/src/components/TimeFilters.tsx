import { useId } from 'react'
import { Dropdown } from './Dropdown'
import { monthsSummary, yearsSummary } from '../lib/filterSummary'
import { toggleYear } from '../lib/period'
import { MONTHS } from '../lib/registry'

export interface TimeFiltersProps {
  /** Selected years, sorted ascending, never empty. */
  years: number[]
  months: number[]
  /** Years present in the loaded data. */
  availableYears: number[]
  /** Last month with published data in the selected years (1–12): the latest published month of any of them. */
  lastMonth: number
  onYears: (years: number[]) => void
  onMonths: (months: number[]) => void
}

/**
 * Shortcut links stay mounted so keyboard focus survives a click; when their
 * result is already the selection they read as spent (aria-disabled, no-op).
 */
const shortcut = (spent: boolean) =>
  `text-[13px] font-medium underline underline-offset-3 ${spent ? 'cursor-default text-ink-3 no-underline' : 'hover:no-underline'}`

const checkboxCell = 'flex items-center gap-2 px-1.5 py-1.5 tabular-nums'

/** The "Año" and "Meses" disclosures of the filter strip: the one moving axis of the page. */
export function TimeFilters(props: TimeFiltersProps) {
  return (
    <>
      <YearsDropdown {...props} />
      <MonthsDropdown {...props} />
    </>
  )
}

function YearsDropdown({ years: selected, availableYears, onYears }: TimeFiltersProps) {
  const hintId = useId()
  // Until meta arrives the selection is the only list there is.
  const years = [...new Set([...availableYears, ...selected])].sort((a, b) => a - b)
  const latestYear = availableYears.length ? Math.max(...availableYears) : null
  const everyYearSelected = availableYears.length > 0 && availableYears.every((y) => selected.includes(y))
  const onlyLatestSelected = latestYear !== null && selected.length === 1 && selected[0] === latestYear

  return (
    <Dropdown label="Año" value={yearsSummary(selected, availableYears)} valueClassName="min-w-[5.5rem] tabular-nums">
      <fieldset>
        <legend className="label mb-2 text-ink-3">Años</legend>
        <div className="grid grid-cols-4 gap-x-1">
          {years.map((y) => {
            const checked = selected.includes(y)
            const locked = checked && selected.length === 1
            return (
              <label
                key={y}
                title={locked ? 'Debe quedar al menos un año' : undefined}
                className={`${checkboxCell} ${locked ? 'cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={locked}
                  aria-describedby={locked ? hintId : undefined}
                  onChange={() => onYears(toggleYear(selected, y))}
                  className="size-4 accent-sello"
                />
                {y}
              </label>
            )
          })}
        </div>
        <p id={hintId} className="sr-only">
          Debe quedar al menos un año seleccionado.
        </p>
      </fieldset>
      {latestYear !== null && (
        <div className="mt-2 flex gap-4 border-t border-ink pt-2.5">
          {availableYears.length > 1 && (
            <button
              type="button"
              aria-disabled={everyYearSelected}
              onClick={() => {
                if (!everyYearSelected) onYears([...availableYears].sort((a, b) => a - b))
              }}
              className={shortcut(everyYearSelected)}
            >
              Todos los años
            </button>
          )}
          <button
            type="button"
            aria-disabled={onlyLatestSelected}
            onClick={() => {
              if (!onlyLatestSelected) onYears([latestYear])
            }}
            className={shortcut(onlyLatestSelected)}
          >
            Último
          </button>
        </div>
      )}
    </Dropdown>
  )
}

function MonthsDropdown({ months, lastMonth, onMonths }: TimeFiltersProps) {
  const noteId = useId()
  const published = Array.from({ length: lastMonth }, (_, i) => i + 1)
  const allSelected = published.every((m) => months.includes(m))
  const unpublished = lastMonth < 12 ? (lastMonth === 11 ? MONTHS[11] : `${MONTHS[lastMonth]}–${MONTHS[11]}`) : null

  const toggleMonth = (m: number) => {
    const next = months.includes(m) ? months.filter((x) => x !== m) : [...months, m].sort((a, b) => a - b)
    onMonths(next.length ? next : published)
  }

  return (
    <Dropdown label="Meses" value={monthsSummary(months, lastMonth)} valueClassName="min-w-[5.5rem]">
      <fieldset>
        <legend className="label mb-2 text-ink-3">Meses</legend>
        <div className="grid grid-cols-4 gap-1">
          {MONTHS.map((name, i) => {
            const m = i + 1
            const available = m <= lastMonth
            return (
              <label
                key={name}
                title={available ? undefined : 'Sin datos publicados'}
                className={`${checkboxCell} ${available ? 'cursor-pointer' : 'hatch cursor-not-allowed text-ink-3'}`}
              >
                <input
                  type="checkbox"
                  checked={available && months.includes(m)}
                  disabled={!available}
                  aria-describedby={available ? undefined : noteId}
                  onChange={() => toggleMonth(m)}
                  className="size-4 accent-sello"
                />
                {name}
              </label>
            )
          })}
        </div>
        {unpublished && (
          <p id={noteId} className="mt-2 text-[12.5px] text-ink-3">
            {unpublished}: sin datos publicados.
          </p>
        )}
      </fieldset>
      <div className="mt-2 border-t border-ink pt-2.5">
        <button
          type="button"
          aria-disabled={allSelected}
          onClick={() => {
            if (!allSelected) onMonths(published)
          }}
          className={shortcut(allSelected)}
        >
          Todos los meses
        </button>
      </div>
    </Dropdown>
  )
}
