import { useEffect, useId, useRef, useState } from 'react'
import { formatLongDate } from '../lib/registry'

export type ColumnTab = 'registro' | 'estadisticas' | 'metodologia' | 'fuentes'

const TABS: { id: ColumnTab; label: string; short?: string }[] = [
  { id: 'registro', label: 'Registro' },
  { id: 'estadisticas', label: 'Estadísticas' },
  { id: 'metodologia', label: 'Metodología' },
  { id: 'fuentes', label: 'Fuentes y licencia', short: 'Fuentes' },
]

interface MastheadProps {
  cutDate: string | null
  tab: ColumnTab
  onTab: (tab: ColumnTab) => void
}

export function Masthead({ cutDate, tab, onTab }: MastheadProps) {
  return (
    <header className="double-rule relative z-20 bg-paper">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3 bg-sello px-4 pt-4 pb-3 text-paper lg:px-6">
        <div className="min-w-0">
          <h1 className="nameplate text-[44px] sm:text-[56px]">ReporteEC</h1>
          <p className="mt-1.5 text-[14px] text-paper/85">Registro público de incidentes de seguridad · Ecuador</p>
        </div>
        <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-[13px] text-paper/85 sm:text-right">
          <dt className="label self-end text-paper/70">Corte de datos</dt>
          <dd className="font-semibold text-paper">{cutDate ? formatLongDate(cutDate) : '…'}</dd>
          <dt className="label self-end text-paper/70">Fuente</dt>
          <dd>Ministerio del Interior</dd>
        </dl>
      </div>
      <nav
        aria-label="Secciones"
        className="flex flex-wrap items-stretch justify-between gap-x-4 border-t border-ink px-4 lg:px-6"
      >
        <ul className="-ml-3 flex overflow-x-auto" role="tablist" aria-label="Contenido de la columna">
          {TABS.map((t) => (
            <li key={t.id} className="shrink-0">
              <button
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => onTab(t.id)}
                className={`h-10 px-3 text-[14px] font-medium transition-colors duration-150 ${
                  tab === t.id ? 'bg-sello text-paper' : 'text-ink hover:underline'
                }`}
              >
                {t.short ? (
                  <>
                    <span className="sm:hidden">{t.short}</span>
                    <span className="hidden sm:inline">{t.label}</span>
                  </>
                ) : (
                  t.label
                )}
              </button>
            </li>
          ))}
        </ul>
        <ReportNotice />
      </nav>
    </header>
  )
}

/** Reporting belongs to a later version; this entry point says so plainly. */
function ReportNotice() {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  return (
    <div ref={root} className="relative flex w-full items-center border-t border-rule-soft py-2 sm:w-auto sm:border-t-0 sm:py-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={`flex h-8 w-full items-center justify-between gap-2 border border-ink px-3 text-[14px] font-medium transition-colors duration-150 sm:w-auto ${
          open ? 'bg-sello text-paper' : 'hatch hover:bg-sheet'
        }`}
      >
        Reportar un incidente
        <span className={`label text-[11px] ${open ? 'text-paper' : 'text-ink-3'}`}>Próximamente</span>
      </button>
      {open && (
        <div
          id={panelId}
          role="region"
          aria-label="Reportes ciudadanos"
          className="ink-in absolute top-full right-0 z-30 mt-2 w-[min(340px,calc(100vw-2rem))] border border-ink bg-sheet p-4 text-[14px] shadow-[0_6px_18px_-8px_rgba(21,33,44,0.35)]"
        >
          <p className="font-semibold">Los reportes ciudadanos llegan en una próxima edición.</p>
          <p className="mt-2 text-ink-2">
            Por ahora este registro publica solo datos oficiales. Cuando se abran los reportes, cada uno entrará como{' '}
            <em className="not-italic font-medium text-ink">En revisión</em> y hará falta una cuenta verificada por
            correo para enviarlo.
          </p>
        </div>
      )}
    </div>
  )
}
