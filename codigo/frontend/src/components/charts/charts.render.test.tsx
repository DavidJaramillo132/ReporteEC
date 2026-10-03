import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BarChart } from './BarChart'
import { ColumnChart } from './ColumnChart'
import { GroupedColumnChart } from './GroupedColumnChart'
import { LineChart } from './LineChart'
import { typeSeries } from './typeEncoding'

const bars = [
  { key: 'a', label: 'Guayas', value: 120, detail: '12,3 por 100.000' },
  { key: 'b', label: 'Pichincha', value: 40 },
]

describe('chart components (server render smoke)', () => {
  it('BarChart renders title, one bar per row, a focusable plot and a collapsed table toggle', () => {
    const html = renderToStaticMarkup(<BarChart title="Casos por provincia" data={bars} />)
    expect(html).toContain('Casos por provincia')
    expect(html).toContain('Guayas')
    expect(html).toContain('tabindex="0"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('Ver tabla')
    expect(html).not.toContain('<table')
    expect(html).not.toContain('aria-label="Leyenda"')
  })

  it('ColumnChart shows ticks and the value labels', () => {
    const html = renderToStaticMarkup(<ColumnChart title="Casos por año" data={[{ key: '2024', label: '2024', value: 3000 }, { key: '2025', label: '2025', value: 4890 }]} />)
    expect(html).toContain('4.890')
    expect(html).toContain('2025')
  })

  it('LineChart draws a legend for two series but not for one', () => {
    const x = ['Ene', 'Feb', 'Mar']
    const one = renderToStaticMarkup(<LineChart title="Mensual" xLabels={x} series={[{ key: '2025', label: '2025', color: '#1d4a73', values: [1, 2, 3] }]} />)
    const two = renderToStaticMarkup(
      <LineChart
        title="Mensual"
        xLabels={x}
        series={[
          { key: '2024', label: '2024', color: '#7fa1bf', values: [1, 2, null] },
          { key: '2025', label: '2025', color: '#1d4a73', values: [2, 3, 4] },
        ]}
      />,
    )
    expect(one).not.toContain('aria-label="Leyenda"')
    expect(two).toContain('aria-label="Leyenda"')
  })

  it('shows an empty message instead of an empty plot', () => {
    expect(renderToStaticMarkup(<BarChart title="Vacío" data={[]} />)).toContain('No hay datos')
    expect(renderToStaticMarkup(<LineChart title="Vacío" xLabels={['Ene']} series={[]} />)).toContain('No hay datos')
    expect(
      renderToStaticMarkup(<LineChart title="Vacío" xLabels={['Ene']} series={[{ key: 'a', label: '2025', color: '#1d4a73', values: [null] }]} />),
    ).toContain('No hay datos')
  })

  it('LineChart draws a single selected month as a lone point with its table', () => {
    const html = renderToStaticMarkup(
      <LineChart title="Un mes" xLabels={['Mar']} series={[{ key: '2025', label: '2025', color: '#1d4a73', values: [7] }]} />,
    )
    expect(html).not.toContain('No hay datos')
    expect(html).toContain('<circle')
    expect(html).toContain('Mar')
    expect(html).not.toContain('NaN')
  })

  it('LineChart splits a line at a null gap and keeps an end label for every series', () => {
    const html = renderToStaticMarkup(
      <LineChart
        title="Huecos"
        xLabels={['Ene', 'Feb', 'Mar', 'Abr']}
        series={[
          { key: '2024', label: '2024', color: '#7fa1bf', values: [1, null, 3, 4] },
          { key: '2025', label: '2025', color: '#1d4a73', values: [1, 2, 3, 4] },
        ]}
      />,
    )
    // 2024 has two runs (Ene) and (Mar-Abr) + 2025 one = 3 line paths
    expect(html.match(/<path[^>]*stroke-width="2"/g)?.length).toBe(3)
    expect(html).not.toContain('NaN')
    expect(html.match(/<title>20/g)?.length).toBe(2)
  })

  it('typeSeries pairs the ink with its mark and name', () => {
    const t = typeSeries('sicariato')
    expect(t.color).toBe('#6d1f3b')
    expect(t.label).toBe('Sicariato')
    expect(t.marker).toBeTruthy()
  })

  it('BarChart draws a custom value label and otherwise falls back to formatValue', () => {
    const html = renderToStaticMarkup(
      <BarChart
        title="Provincias, por tasa"
        data={[{ key: '09', label: 'Guayas', value: 66.123, valueLabel: '66,1 (3.456)' }]}
        formatValue={(v) => v.toFixed(1)}
        categoryHeader="Provincia"
      />,
    )
    expect(html).toContain('66,1 (3.456)')
    expect(html).not.toContain('66,123')
    // Without a valueLabel, the bar-tip label falls back to formatValue.
    expect(renderToStaticMarkup(<BarChart title="T" data={[{ key: 'a', label: 'A', value: 66.123 }]} formatValue={(v) => v.toFixed(1)} />)).toContain('66.1')
  })

  it('ColumnChart takes a custom height', () => {
    const html = renderToStaticMarkup(<ColumnChart title="Por año" height={170} data={[{ key: '2024', label: '2024', value: 3 }]} />)
    expect(html).toContain('viewBox="0 0 360 170"')
  })

  it('GroupedColumnChart draws one column per series and group, a legend with marks and the newest group capped by marks', () => {
    const series = [typeSeries('homicidio'), typeSeries('femicidio')]
    const html = renderToStaticMarkup(
      <GroupedColumnChart
        title="Casos por tipo y año"
        series={series}
        groups={[
          { key: '2024', label: '2024', values: [100, 5], details: ['1,0 por 100.000 hab.', '0,1 por 100.000 hab.'] },
          { key: '2025', label: '2025', values: [120, 7], details: ['1,2 por 100.000 hab.', '0,1 por 100.000 hab.'] },
        ]}
      />,
    )
    expect(html).toContain('aria-label="Leyenda"')
    expect(html).toContain('Homicidio')
    expect(html.match(/fill="#b23b2a"/g)?.length).toBeGreaterThanOrEqual(2)
    expect(html.match(/fill="#8a55bd"/g)?.length).toBeGreaterThanOrEqual(2)
    // Marks on the 2025 caps: a scaled nested svg per series.
    expect(html.match(/viewBox="0 0 18 18"/g)?.length).toBe(2)
    expect(html).toContain('2025')
    expect(html).not.toContain('NaN')
  })

  it('GroupedColumnChart shows an empty message without groups', () => {
    expect(renderToStaticMarkup(<GroupedColumnChart title="Vacío" groups={[]} series={[typeSeries('homicidio')]} />)).toContain('No hay datos')
  })
})
