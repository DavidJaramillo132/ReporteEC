import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

const PANEL_WIDTH = 300
const GUTTER = 16

interface DropdownProps {
  label: string
  /** Short summary of the current choice, shown on the button. */
  value: string
  /** Paints the button as active (sello) when the choice adds something to the map. */
  highlighted?: boolean
  children: ReactNode
}

/**
 * A filter disclosure in the PlaceSelect frame: label, value and chevron.
 * The panel is position: fixed, measured from the button, so the filter
 * strip's horizontal scroller on mobile never clips it.
 */
export function Dropdown({ label, value, highlighted = false, children }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const panelId = useId()
  const button = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const rect = button.current?.getBoundingClientRect()
      if (!rect) return
      const width = Math.min(PANEL_WIDTH, window.innerWidth - GUTTER * 2)
      const left = Math.max(GUTTER, Math.min(rect.left, window.innerWidth - width - GUTTER))
      setPosition({ top: rect.bottom + 6, left })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent) => {
      const target = e.target as Node
      if (!panel.current?.contains(target) && !button.current?.contains(target)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      button.current?.focus()
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={`flex h-8 shrink-0 items-center border border-ink text-[13px] transition-colors duration-150 ${
          highlighted ? 'bg-sello text-paper' : 'bg-sheet text-ink hover:bg-paper-deep'
        }`}
      >
        <span className={`label border-r px-2 leading-[30px] ${highlighted ? 'border-paper/40' : 'border-ink'}`}>
          {label}
        </span>
        <span className="flex items-center gap-2 pr-2.5 pl-2 whitespace-nowrap">
          {value}
          <svg
            aria-hidden="true"
            width="10"
            height="6"
            viewBox="0 0 10 6"
            className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          >
            <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </span>
      </button>
      {open && position && (
        <div
          ref={panel}
          id={panelId}
          className="ink-in fixed z-40 border border-ink bg-sheet p-3 text-[14px] shadow-[0_6px_18px_-8px_rgba(21,33,44,0.35)]"
          style={{ top: position.top, left: position.left, width: `min(${PANEL_WIDTH}px, calc(100vw - ${GUTTER * 2}px))` }}
        >
          {children}
        </div>
      )}
    </>
  )
}
