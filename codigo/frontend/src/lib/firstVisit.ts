/**
 * The first-visit intro dialog's dismissal flag (see components/IntroDialog.tsx).
 * Same defensive pattern as persist.ts: browser storage may be unavailable
 * (private mode, a blocked origin), and the dialog must still work -- it
 * just reappears every visit instead of staying dismissed.
 */
const KEY = 'reporteec:aviso-inicial:v1'

export function hasSeenIntro(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function markIntroSeen() {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    // Private mode or blocked storage: the dialog just reappears next visit.
  }
}
