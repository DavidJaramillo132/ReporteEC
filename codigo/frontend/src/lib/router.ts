/**
 * A minimal History-API router: four static routes plus a 404, no external
 * dependency. There is no path-param matching -- the whole app only ever
 * needs exact paths (see the plan at
 * .claude/plans/virtual-meandering-balloon.md) -- so `matchRoute` is a plain
 * lookup, kept pure and DOM-free so it is unit-testable (see router.test.ts).
 */
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react'
import { createElement, useSyncExternalStore } from 'react'

export type RouteName = 'mapa' | 'estadisticas' | 'metodologia' | 'fuentes' | 'no-encontrada'

interface RouteDef {
  path: string
  name: RouteName
}

const ROUTES: RouteDef[] = [
  { path: '/', name: 'mapa' },
  { path: '/estadisticas', name: 'estadisticas' },
  { path: '/metodologia', name: 'metodologia' },
  { path: '/fuentes', name: 'fuentes' },
]

/** Only `/` and `/estadisticas` read filters from the query string (see urlState.ts). */
export const FILTERED_ROUTES: RouteName[] = ['mapa', 'estadisticas']

/** A trailing slash never changes which route matches, except the root itself. */
function normalize(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
}

/** Pure path matcher: the one piece of routing logic worth unit-testing without a DOM. */
export function matchRoute(pathname: string): RouteName {
  const normalized = normalize(pathname)
  return ROUTES.find((route) => route.path === normalized)?.name ?? 'no-encontrada'
}

const listeners = new Set<() => void>()

function getSnapshot(): string {
  return window.location.pathname
}

function subscribe(listener: () => void): () => void {
  window.addEventListener('popstate', listener)
  listeners.add(listener)
  return () => {
    window.removeEventListener('popstate', listener)
    listeners.delete(listener)
  }
}

function emit() {
  for (const listener of listeners) listener()
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Navigates to `to` (path + optional query + optional `#hash`), intercepting
 * a full page reload. A plain path/query change scrolls to the top of the
 * new page; a `#hash` scrolls that element into view instead (used by the
 * Estadísticas section index and the Metodología/Fuentes tables of
 * contents) -- both skipped on `replace`, which never represents a reader
 * navigating anywhere (see replaceQuery below).
 */
export function navigate(to: string, options: { replace?: boolean } = {}): void {
  const hashIndex = to.indexOf('#')
  const hash = hashIndex >= 0 ? to.slice(hashIndex + 1) : null

  if (options.replace) window.history.replaceState(null, '', to)
  else window.history.pushState(null, '', to)
  emit()

  if (options.replace) return
  if (hash) {
    // The target page may still be about to mount; give it a tick.
    requestAnimationFrame(() => {
      document.getElementById(hash)?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
    })
  } else {
    window.scrollTo(0, 0)
  }
}

/**
 * Rewrites only the query string of the current URL, keeping the path and
 * never touching browser history (see plan: "Se actualiza con
 * replaceState, así cambiar un filtro no llena el historial").
 */
export function replaceQuery(search: string): void {
  const url = search ? `${window.location.pathname}?${search}` : window.location.pathname
  if (url === `${window.location.pathname}${window.location.search}`) return
  window.history.replaceState(null, '', url)
  emit()
}

/** The current pathname, reactive to `navigate()` and browser back/forward. */
export function useRoute(): string {
  return useSyncExternalStore(subscribe, getSnapshot, () => '/')
}

export { normalize as normalizePath }

interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'onClick'> {
  to: string
  children?: ReactNode
  /** Called before navigating, e.g. to close a menu or dialog the link sits in. */
  onClick?: () => void
}

/**
 * An internal navigation link: a real `<a href>` (so middle-click, Cmd/Ctrl
 * click, "open in new tab" and screen readers all keep working), but a plain
 * left click intercepts the browser's own navigation and calls `navigate`
 * instead -- kept as `createElement` so this file can stay a plain `.ts`
 * module, not `.tsx` (see the plan).
 */
export function Link({ to, children, onClick, ...rest }: LinkProps) {
  return createElement(
    'a',
    {
      ...rest,
      href: to,
      onClick: (event: MouseEvent<HTMLAnchorElement>) => {
        const isModified = event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
        if (event.defaultPrevented || isModified) return
        event.preventDefault()
        onClick?.()
        navigate(to)
      },
    },
    children,
  )
}
