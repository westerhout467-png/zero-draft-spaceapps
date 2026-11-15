import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Claim } from '../lib/claims'
import { CitationDrawer } from './CitationDrawer'
import { CitationContext } from './citationContext'

/**
 * Holds which claim the citation drawer (F6) shows, and mounts the drawer once for the whole
 * app, so it works on every view. Closing returns focus to whatever opened it.
 */
export function CitationProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<string | Claim | null>(null)
  const returnFocusTo = useRef<HTMLElement | null>(null)

  const openCitation = useCallback((claim: string | Claim) => {
    setTarget((current) => {
      // Remember the opener only on the first open, not when the drawer switches claims.
      if (current === null && document.activeElement instanceof HTMLElement) {
        returnFocusTo.current = document.activeElement
      }
      return claim
    })
  }, [])

  const close = useCallback(() => {
    setTarget(null)
    returnFocusTo.current?.focus()
    returnFocusTo.current = null
  }, [])

  const api = useMemo(() => ({ openCitation }), [openCitation])

  return (
    <CitationContext.Provider value={api}>
      {children}
      <CitationDrawer target={target} onClose={close} />
    </CitationContext.Provider>
  )
}
