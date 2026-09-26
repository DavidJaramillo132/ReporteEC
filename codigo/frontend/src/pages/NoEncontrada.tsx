import { useEffect } from 'react'
import { Link } from '../lib/router'

/** A plain 404 for any path outside the four routes in lib/router.ts. */
export function NoEncontrada() {
  useEffect(() => {
    document.title = 'Página no encontrada · ReporteEC'
  }, [])

  return (
    <div className="mx-auto flex w-full max-w-[68ch] flex-col items-start px-4 py-10">
      <h1 className="nameplate text-[34px]">Página no encontrada</h1>
      <p className="mt-3 text-[14.5px] text-ink-2">
        La dirección a la que intentaste llegar no existe en ReporteEC.
      </p>
      <Link to="/" className="mt-5 border border-ink bg-sello px-4 py-1.5 text-[14px] font-medium text-paper hover:bg-ink">
        Ir al mapa
      </Link>
    </div>
  )
}
