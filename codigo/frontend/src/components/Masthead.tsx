import { useEffect, useId, useRef, useState } from 'react'
import type { RouteName } from '../lib/router'
import { Link } from '../lib/router'
import { formatLongDate } from '../lib/registry'

interface MastheadProps {
  cutDate: string | null
  route: RouteName
}

const NAV: { to: string; label: string; route: RouteName }[] = [
  { to: '/', label: 'Mapa', route: 'mapa' },
  { to: '/estadisticas', label: 'Estadísticas', route: 'estadisticas' },
  { to: '/metodologia', label: 'Metodología', route: 'metodologia' },
  { to: '/fuentes', label: 'Fuentes', route: 'fuentes' },
]

/** A single ~56px bar on the sello field: nameplate, section nav, data cut, "Reportar". Below `sm:`, the nav/cut/"Reportar" collapse into a disclosure menu (see the plan). */
export function Masthead({ cutDate, route }: MastheadProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuId = useId()

  return (
    <header className="double-rule relative z-30 bg-sello text-paper">
      <div className="flex h-14 items-center gap-4 px-4 lg:px-6">
        <Link to="/" className="nameplate shrink-0 text-[22px] sm:text-[26px]">
          ReporteEC
        </Link>

        <nav aria-label="Secciones" className="hidden min-w-0 items-center gap-1 sm:flex">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              aria-current={route === item.route ? 'page' : undefined}
              className={`flex h-8 items-center px-2.5 text-[14px] font-medium transition-colors duration-150 ${
                route === item.route ? 'bg-paper text-sello' : 'text-paper/85 hover:bg-sello-soft/25 hover:text-paper'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto hidden shrink-0 items-center gap-4 sm:flex">
          <p className="text-[12.5px] text-paper/85">
            <span className="label text-paper/65">Corte </span>
            {cutDate ? formatLongDate(cutDate) : '…'}
          </p>
          <ReportNotice />
        </div>

        <button
          type="button"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          onClick={() => setMenuOpen((v) => !v)}
          className="ml-auto flex h-8 items-center gap-1.5 border border-paper/50 px-2.5 text-[13px] font-medium sm:hidden"
        >
          Menú
        </button>
      </div>

      {menuOpen && (
        <div id={menuId} className="space-y-3 border-t border-paper/30 px-4 py-3 sm:hidden">
          <nav aria-label="Secciones" className="flex flex-col">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMenuOpen(false)}
                aria-current={route === item.route ? 'page' : undefined}
                className={`flex h-9 items-center px-1 text-[15px] font-medium ${
                  route === item.route ? 'font-semibold text-paper underline' : 'text-paper/85'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <p className="text-[12.5px] text-paper/85">
            <span className="label text-paper/65">Corte de datos </span>
            {cutDate ? formatLongDate(cutDate) : '…'}
          </p>
          <ReportNotice />
        </div>
      )}
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
    <div ref={root} className="relative flex w-full items-center sm:w-auto">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={`flex h-8 w-full items-center justify-between gap-2 border px-2.5 text-[13px] font-medium transition-colors duration-150 sm:w-auto ${
          open ? 'border-paper bg-paper text-sello' : 'border-paper/50 text-paper hover:bg-paper/10'
        }`}
      >
        Reportar
        <span className={`label text-[10.5px] ${open ? 'text-sello/70' : 'text-paper/65'}`}>Próximamente</span>
      </button>
      {open && (
        <div
          id={panelId}
          role="region"
          aria-label="Reportes ciudadanos"
          className="ink-in absolute top-full right-0 z-30 mt-2 w-[min(340px,calc(100vw-2rem))] border border-ink bg-sheet p-4 text-[14px] text-ink shadow-[0_6px_18px_-8px_rgba(21,33,44,0.35)]"
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
