import { BarChart } from '../../components/charts/BarChart'
import { GroupedColumnChart } from '../../components/charts/GroupedColumnChart'
import { LineChart } from '../../components/charts/LineChart'
import { typeSeries } from '../../components/charts/typeEncoding'
import type { StatsRow, TimeseriesPoint } from '../../lib/api'
import { yearColor } from '../../lib/charts'
import { formatPeriodLabel } from '../../lib/period'
import { type IncidentType, MONTHS } from '../../lib/registry'
import { formatRate } from '../../lib/stats'
import { incompleteYearNote, monthlyLinesByYear, rateFor, typeBars, typesByYear } from '../../lib/statsCharts'
import { StatsSection } from './StatsSection'

interface IncidentsSectionProps {
  years: number[]
  months: number[]
  types: IncidentType[]
  byType: StatsRow[]
  timeseries: TimeseriesPoint[]
  byYear: StatsRow[]
  typesPerYear: { year: number; rows: StatsRow[] }[]
  periodTo: string | null | undefined
}

/**
 * Cases by type (bars in the type inks, each with its mark), with several
 * years every type per year as grouped columns beside them, and the monthly
 * series with one line per selected year (the `sello` ramp, newest darkest).
 */
export function IncidentsSection({ years, months, types, byType, timeseries, byYear, typesPerYear, periodTo }: IncidentsSectionProps) {
  const period = formatPeriodLabel(years, months)
  const partialNote = incompleteYearNote(years, months, periodTo)
  const several = years.length > 1

  const bars = typeBars(byType, types).map((bar) => ({ ...bar, ...typeSeries(bar.key) }))

  const sortedMonths = [...months].sort((a, b) => a - b)
  const lines = monthlyLinesByYear(timeseries, years, months, periodTo)
  const populationByYear = new Map(byYear.map((row) => [Number(row.key), row.population]))
  const monthlyRate = (lineIndex: number, monthIndex: number) => {
    const line = lines[lineIndex]
    const count = line?.values[monthIndex]
    if (count === null || count === undefined) return undefined
    const rate = rateFor(count, populationByYear.get(line.year))
    return rate === null ? undefined : `${formatRate(rate)} por 100.000 hab.`
  }

  const grouped = typesByYear(typesPerYear, types)

  return (
    <StatsSection id="incidentes" title="Incidentes" measures={`Casos por tipo y por mes, ${period}.`} anchor="conteo-y-tasa">
      <BarChart
        title="Casos por tipo"
        subtitle="Casos y, entre paréntesis, la tasa por 100.000 habitantes."
        data={bars}
        valueHeader="Casos"
        detailHeader="Tasa"
        categoryHeader="Tipo"
        emptyText="No hay casos de los tipos elegidos en este período."
      />
      {several && (
        <GroupedColumnChart
          title="Casos por tipo y año"
          subtitle={['Cada tipo ocupa el mismo lugar en cada año; la tasa está en el detalle y en la tabla.', partialNote].filter(Boolean).join(' ')}
          groups={grouped.groups}
          series={grouped.types.map((type) => typeSeries(type))}
        />
      )}
      <LineChart
        className={several ? 'xl:col-span-2' : undefined}
        title="Casos por mes"
        subtitle={[several ? 'Una línea por año: el más reciente, más oscuro.' : null, partialNote].filter(Boolean).join(' ') || undefined}
        xLabels={sortedMonths.map((month) => MONTHS[month - 1])}
        series={lines.map((line) => ({ key: String(line.year), label: String(line.year), color: yearColor(line.year, years), values: line.values }))}
        detailFor={monthlyRate}
        valueName="casos"
      />
    </StatsSection>
  )
}
