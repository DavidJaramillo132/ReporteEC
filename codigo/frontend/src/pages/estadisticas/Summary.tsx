import { ColumnChart } from '../../components/charts/ColumnChart'
import type { StatsRow } from '../../lib/api'
import { yearColor } from '../../lib/charts'
import { formatPeriodLabel, previousYearFor } from '../../lib/period'
import { FIRST_YEAR, type IncidentType, formatCount } from '../../lib/registry'
import { formatRate } from '../../lib/stats'
import { LOW_POPULATION_TEXT, incompleteYearNote, rateFor, rateText, yearTotalsFor } from '../../lib/statsCharts'

interface SummaryProps {
  years: number[]
  months: number[]
  types: IncidentType[]
  areaName: string
  byType: StatsRow[]
  byYear: StatsRow[]
  previousPeriodCount: number | null
  periodTo: string | null | undefined
}

/**
 * The headline: cases and rate for the whole filtered period. With one year it
 * adds the change against the same months of the previous year; with several,
 * a small column chart of cases per selected year (same year shades as the
 * monthly lines below).
 */
export function Summary({ years, months, types, areaName, byType, byYear, previousPeriodCount, periodTo }: SummaryProps) {
  // byType holds every type (the filter chips count them all); the headline follows the type filter.
  const total = byType.filter((row) => types.includes(row.key as IncidentType)).reduce((sum, row) => sum + row.count, 0)
  const population = byType[0]?.population ?? null
  const lowPopulation = byType[0]?.low_population_warning ?? false
  const rate = rateFor(total, population)
  const several = years.length > 1
  const previousYear = previousYearFor(years, FIRST_YEAR)
  const change = previousPeriodCount ? ((total - previousPeriodCount) / previousPeriodCount) * 100 : null

  const perYear = yearTotalsFor(byYear, years)

  return (
    <section aria-labelledby="resumen-title" className="mt-4 border-y border-ink py-4">
      <h2 id="resumen-title" className="text-[15px] font-semibold">
        Resumen <span className="font-normal text-ink-2">· {areaName}, {formatPeriodLabel(years, months)}</span>
      </h2>
      <div className={`mt-3 grid gap-x-10 gap-y-5 ${several ? 'md:grid-cols-2' : ''}`}>
        <dl className="grid grid-cols-2 content-start gap-x-6 gap-y-4 sm:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]">
          <Figure label="Casos" value={formatCount(total)} />
          <Figure
            label={several ? 'Tasa por 100.000 hab., promedio por año' : 'Tasa por 100.000 hab.'}
            value={formatRate(rate)}
            warning={lowPopulation}
          />
          {!several && (
            <Figure
              label={previousYear === null ? 'Variación frente al año anterior' : `Variación frente a ${formatPeriodLabel([previousYear], months)}`}
              value={change === null ? 'Sin dato' : `${change >= 0 ? '+' : '−'}${formatRate(Math.abs(change))} %`}
              note={previousPeriodCount !== null && previousYear !== null ? `${formatCount(previousPeriodCount)} casos en ${previousYear}` : undefined}
            />
          )}
        </dl>
        {several && (
          <ColumnChart
            title="Casos por año elegido"
            subtitle={incompleteYearNote(years, months, periodTo) ?? undefined}
            height={170}
            data={perYear.map((t) => ({
              key: String(t.year),
              label: String(t.year),
              value: t.count,
              detail: rateText(t.rate),
              color: yearColor(t.year, years),
            }))}
            valueHeader="Casos"
            detailHeader="Tasa"
          />
        )}
      </div>
    </section>
  )
}

function Figure({ label, value, warning, note }: { label: string; value: string; warning?: boolean; note?: string }) {
  return (
    <div>
      <dt className="label text-ink-3">{label}</dt>
      <dd className="mt-1 text-[32px] leading-none font-semibold text-ink sm:text-[40px]">
        {value}
        {warning && (
          <span title={LOW_POPULATION_TEXT} className="ml-1 align-top text-[16px]">
            <span aria-hidden="true">⚠</span>
            <span className="sr-only">{LOW_POPULATION_TEXT}.</span>
          </span>
        )}
      </dd>
      {note && <dd className="mt-1 text-[12.5px] text-ink-3">{note}</dd>}
    </div>
  )
}
