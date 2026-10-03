import { BarChart } from '../../components/charts/BarChart'
import { ColumnChart } from '../../components/charts/ColumnChart'
import { CANTON_INDICATOR_LABEL, indicatorRowsToStatsRows, noDataMessage } from '../../lib/cantonChoropleth'
import { formatYears, rateLabel } from '../../lib/period'
import { formatRate } from '../../lib/stats'
import { TREND_COLORS, rateBars, trendColumns, trendLegend } from '../../lib/statsCharts'
import { ChartNote, LowPopulationNote, StatsSection } from './StatsSection'
import type { CantonIndicatorData } from './useStatsData'

interface CantonIndicatorSectionProps {
  indicator: 'extorsion' | 'siniestros'
  id: string
  title: string
  measures: string
  anchor: string
  /** Plural noun for the counted unit: «denuncias», «siniestros». */
  unit: string
  /** A caveat about the yearly totals, shown under the trend title. */
  trendNote?: string
  years: number[]
  data: CantonIndicatorData
}

/**
 * Extortion or traffic crashes: the national total over every year the source
 * has (the selected years strong, the rest muted, in the section's own ramp),
 * and the cantons with the highest rate across the selected years.
 */
export function CantonIndicatorSection({ indicator, id, title, measures, anchor, unit, trendNote, years, data }: CantonIndicatorSectionProps) {
  const colors = TREND_COLORS[indicator]
  const columns = trendColumns(
    data.summary.map((y) => ({ year: y.year, count: y.value, rate: y.rate_per_100k })),
    data.usedYears,
    colors,
  )
  const top = rateBars(indicatorRowsToStatsRows(data.rows), 15, unit)
  const missing = years.filter((year) => !data.usedYears.includes(year))
  const capitalUnit = unit.charAt(0).toUpperCase() + unit.slice(1)

  return (
    <StatsSection id={id} title={title} measures={measures} anchor={anchor}>
      <ColumnChart
        title={`${capitalUnit} por año, todo el país`}
        subtitle={trendNote}
        data={columns}
        valueHeader={capitalUnit}
        detailHeader="Tasa"
        legend={trendLegend(columns, colors)}
      />
      <div>
        <BarChart
          title={`Cantones con mayor tasa (15)${data.usedYears.length ? `, ${formatYears(data.usedYears)}` : ''}`}
          subtitle={`${rateLabel('Tasa por 100.000 habitantes', data.usedYears.length)} y, entre paréntesis, el total de ${unit}.`}
          data={top}
          color={colors.strong}
          formatValue={formatRate}
          valueHeader={rateLabel('Tasa por 100.000', data.usedYears.length)}
          detailHeader={capitalUnit}
          categoryHeader="Cantón"
          emptyText={noDataMessage(indicator, formatYears(years))}
        />
        {missing.length > 0 && data.usedYears.length > 0 && (
          <ChartNote>
            Sin datos de {CANTON_INDICATOR_LABEL[indicator]} para {formatYears(missing)}: el orden usa solo {formatYears(data.usedYears)}.
          </ChartNote>
        )}
        <LowPopulationNote shown={top.some((bar) => bar.lowPopulation)} />
      </div>
    </StatsSection>
  )
}
