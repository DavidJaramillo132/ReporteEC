import { BarChart } from '../../components/charts/BarChart'
import { ColumnChart } from '../../components/charts/ColumnChart'
import type { StatsRow } from '../../lib/api'
import { formatRate } from '../../lib/stats'
import { TREND_COLORS, incompleteYearNote, rateBars, trendColumns, trendLegend, yearTotalsFromRows } from '../../lib/statsCharts'
import { LowPopulationNote, StatsSection } from './StatsSection'

interface PoliceSectionProps {
  years: number[]
  months: number[]
  periodTo: string | null | undefined
  detentionsByYear: StatsRow[]
  detentionsByProvince: StatsRow[]
}

/**
 * Detentions are police activity, not insecurity: neutral ink greys only,
 * never a type ink or the incident ramp, and never added to the cases above.
 */
export function PoliceSection({ years, months, periodTo, detentionsByYear, detentionsByProvince }: PoliceSectionProps) {
  const colors = TREND_COLORS.detentions
  const totals = yearTotalsFromRows(detentionsByYear)
  const columns = trendColumns(totals, years, colors)
  const provinces = rateBars(detentionsByProvince, Infinity, 'detenciones')
  const partialNote = incompleteYearNote(
    totals.map((t) => t.year),
    months,
    periodTo,
  )

  return (
    <StatsSection
      id="actividad-policial"
      title="Actividad policial"
      measures="Detenciones y aprehensiones: acciones de la Policía, no hechos de inseguridad — no es inseguridad, nunca se suman a los casos de arriba."
      anchor="detenciones"
      isLast
    >
      <ColumnChart
        title="Detenciones por año, en los meses elegidos"
        subtitle={partialNote ?? undefined}
        data={columns}
        color={colors.strong}
        valueHeader="Detenciones"
        detailHeader="Tasa"
        legend={trendLegend(columns, colors)}
      />
      <div>
        <BarChart
          title="Provincias, por tasa de detenciones"
          subtitle="Tasa por 100.000 habitantes y, entre paréntesis, el total de detenciones."
          data={provinces}
          color={colors.strong}
          formatValue={formatRate}
          valueHeader="Tasa por 100.000"
          detailHeader="Detenciones"
          categoryHeader="Provincia"
        />
        <LowPopulationNote shown={provinces.some((bar) => bar.lowPopulation)} />
      </div>
    </StatsSection>
  )
}
