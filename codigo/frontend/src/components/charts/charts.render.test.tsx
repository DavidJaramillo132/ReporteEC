import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BarChart } from './BarChart'
import { ColumnChart } from './ColumnChart'
import { LineChart } from './LineChart'

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
  })
})
