import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { numberFootnotes, sameNumbers } from '../lib/footnotes'
import { FootnoteContext, type FootnoteEntry } from './footnoteContext'

/**
 * Numbers every <Cite> inside it ¹ ² ³ in the order they appear on the page. The app has one
 * scope for the header plus the current view; the citation drawer has its own.
 *
 * Numbers are worked out again whenever a Cite mounts or unmounts, in a layout effect, so the
 * right numbers are on screen before the browser paints.
 */
export function FootnoteScope({ children }: { children: ReactNode }) {
  const entries = useRef(new Set<FootnoteEntry>())
  const [version, setVersion] = useState(0)
  const [numbers, setNumbers] = useState<ReadonlyMap<string, number>>(() => new Map())

  const register = useCallback((entry: FootnoteEntry) => {
    entries.current.add(entry)
    setVersion((v) => v + 1)
    return () => {
      entries.current.delete(entry)
      setVersion((v) => v + 1)
    }
  }, [])

  // `version` is only a trigger: it changes whenever the set of footnotes changes.
  useLayoutEffect(() => {
    const inOrder = [...entries.current].sort((a, b) =>
      a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    )
    const next = numberFootnotes(inOrder.map((entry) => entry.id))
    setNumbers((current) => (sameNumbers(current, next) ? current : next))
  }, [version])

  const api = useMemo(() => ({ register, numbers }), [register, numbers])
  return <FootnoteContext.Provider value={api}>{children}</FootnoteContext.Provider>
}
