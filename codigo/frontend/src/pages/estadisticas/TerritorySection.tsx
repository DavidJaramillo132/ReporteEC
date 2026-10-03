import { BarChart } from '../../components/charts/BarChart'
import type { StatsRow } from '../../lib/api'
import { formatRate } from '../../lib/stats'
import { rateBars } from '../../lib/statsCharts'
import { ChartNote, LowPopulationNote, StatsSection } from './StatsSection'

interface TerritorySectionProps {
  /** Name of the selected province, or null for the whole country. */
  provinceName: string | null
  /** True when a single canton is selected: a one-bar ranking says nothing. */
  cantonSelected: boolean
  byPlace: StatsRow[]
  cantonRanking: StatsRow[]
}

const RATE_FIRST = 'Tasa por 100.000 habitantes y, entre paréntesis, los casos.'

/** Places ranked by rate: provinces (or the cantons of the chosen province) and the national top 15 cantons. */
export function TerritorySection({ provinceName, cantonSelected, byPlace, cantonRanking }: TerritorySectionProps) {
  const places = rateBars(byPlace)
  const unranked = byPlace.length - places.length
  const top = rateBars(cantonRanking, 15)

  return (
    <StatsSection
      id="territorio"
      title="Territorio"
      measures={`${provinceName ? `Los cantones de ${provinceName}` : 'Las provincias'} y los 15 cantones del país con mayor tasa.`}
      anchor="conteo-y-tasa"
    >
      {!cantonSelected && (
        <div>
          <BarChart
            title={provinceName ? `Cantones de ${provinceName}, por tasa` : 'Provincias, por tasa'}
            subtitle={RATE_FIRST}
            data={places}
            formatValue={formatRate}
            valueHeader="Tasa por 100.000"
            detailHeader="Casos"
            categoryHeader={provinceName ? 'Cantón' : 'Provincia'}
          />
          {unranked > 0 && <ChartNote>{unranked === 1 ? 'Un lugar sin dato de población queda fuera del orden.' : `${unranked} lugares sin dato de población quedan fuera del orden.`}</ChartNote>}
          <LowPopulationNote shown={places.some((bar) => bar.lowPopulation)} />
        </div>
      )}
      <div>
        <BarChart
          title="Cantones con mayor tasa, todo el país (15)"
          subtitle={RATE_FIRST}
          data={top}
          formatValue={formatRate}
          valueHeader="Tasa por 100.000"
          detailHeader="Casos"
          categoryHeader="Cantón"
        />
        <LowPopulationNote shown={top.some((bar) => bar.lowPopulation)} />
      </div>
    </StatsSection>
  )
}
