import type { ReactNode } from 'react'
import { Link } from '../../lib/router'
import { LOW_POPULATION_TEXT } from '../../lib/statsCharts'

interface StatsSectionProps {
  id: string
  title: string
  /** One line on what the section measures. */
  measures: string
  /** `/metodologia#anchor` behind «Cómo se calcula». */
  anchor: string
  isLast?: boolean
  children: ReactNode
}

/** One `id`-anchored section of the page: title, «Cómo se calcula», what it measures, then its charts. */
export function StatsSection({ id, title, measures, anchor, isLast, children }: StatsSectionProps) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={`scroll-mt-4 border-b border-rule-soft py-5 ${isLast ? 'border-b-0' : ''}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={`${id}-title`} className="text-[19px] leading-snug font-semibold">
          {title}
        </h2>
        <Link to={`/metodologia#${anchor}`} className="text-[13px] font-medium text-ink underline hover:no-underline">
          Cómo se calcula
        </Link>
      </div>
      <p className="mt-1 max-w-[70ch] text-[13.5px] text-ink-2">{measures}</p>
      <div className="mt-4 grid gap-x-10 gap-y-8 text-[14px] text-ink-2 xl:grid-cols-2">{children}</div>
    </section>
  )
}

/** A short plain-text note under a chart (e.g. what ⚠ means). */
export function ChartNote({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-[12.5px] text-ink-3">{children}</p>
}

/** Explains the ⚠ next to a rate, only when some bar in the chart carries it. */
export function LowPopulationNote({ shown }: { shown: boolean }) {
  return shown ? <ChartNote>⚠ {LOW_POPULATION_TEXT}; léela junto con los casos.</ChartNote> : null
}
