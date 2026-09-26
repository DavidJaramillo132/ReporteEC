import { useEffect, useId, useRef } from 'react'
import { Link } from '../lib/router'

interface IntroDialogProps {
  open: boolean
  onClose: () => void
}

const FOCUSABLE = 'button, a[href], [tabindex]:not([tabindex="-1"])'

/**
 * "Cómo leer ReporteEC": shown once on first visit (see lib/firstVisit.ts)
 * and reopenable on demand from the map legend's "Cómo leer el mapa" link.
 * Focus-trapped, closes on Esc or an outside click, and returns focus to
 * whatever had it before the dialog opened.
 */
export function IntroDialog({ open, onClose }: IntroDialogProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreFocusTo = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    restoreFocusTo.current = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    const focusables = () => Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
    focusables()[0]?.focus()

    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeydown)
    return () => {
      document.removeEventListener('keydown', handleKeydown)
      restoreFocusTo.current?.focus()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/50 px-4 py-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="ink-in max-h-[calc(100svh-3rem)] w-[min(460px,100%)] overflow-y-auto border border-ink bg-sheet shadow-[0_6px_18px_-8px_rgba(21,33,44,0.35)]"
      >
        <header className="bg-sello px-4 py-4 text-paper">
          <h2 id={titleId} className="nameplate text-[28px]">
            Cómo leer ReporteEC
          </h2>
        </header>
        <div className="space-y-2.5 px-4 py-4 text-[14px] text-ink-2">
          <p>
            ReporteEC es un registro público de incidentes de seguridad en Ecuador, hecho con datos oficiales.
          </p>
          <p>
            El mapa muestra casos <strong className="font-semibold text-ink">denunciados o registrados</strong>{' '}
            por una fuente oficial, no todo el delito que ocurre.
          </p>
          <p>El color y la forma de cada marca dicen el tipo de caso; su trazo dice el nivel de confianza.</p>
          <p>Al alejar el mapa se ve un mapa de calor; al acercarlo aparece cada caso como una marca.</p>
          <p>
            Las detenciones y los cantones de extorsión o siniestros son capas aparte: se activan a mano y nunca
            se mezclan con los incidentes.
          </p>
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-rule-soft px-4 py-3">
          <Link
            to="/metodologia"
            onClick={onClose}
            className="text-[14px] font-medium text-ink underline hover:no-underline"
          >
            Ver metodología
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="border border-ink bg-sello px-4 py-1.5 text-[14px] font-medium text-paper hover:bg-ink"
          >
            Entendido
          </button>
        </footer>
      </div>
    </div>
  )
}
