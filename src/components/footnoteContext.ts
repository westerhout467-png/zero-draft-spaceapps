import { useIsPresent } from 'motion/react'
import { createContext, useContext, useLayoutEffect, useState, type RefObject } from 'react'

export type FootnoteEntry = { id: string; element: HTMLElement }

export type FootnoteApi = {
  /** Adds a footnote to the numbering. Returns the function that removes it. */
  register: (entry: FootnoteEntry) => () => void
  /** Claim id → footnote number, in document order. */
  numbers: ReadonlyMap<string, number>
}

export const FootnoteContext = createContext<FootnoteApi | null>(null)

/**
 * The footnote number for a claim inside the nearest <FootnoteScope>, or undefined until it is
 * known (the first render, before the browser paints). `id` is null for a Cite that renders
 * nothing.
 *
 * While a view fades out (motion's AnimatePresence), its footnotes leave the numbering and keep
 * the number they had, so the incoming view is numbered from the start without a jump.
 */
export function useFootnoteNumber(
  id: string | null,
  ref: RefObject<HTMLElement | null>,
): number | undefined {
  const scope = useContext(FootnoteContext)
  const register = scope?.register
  const isPresent = useIsPresent()

  useLayoutEffect(() => {
    const element = ref.current
    if (!register || id === null || !isPresent || !element) return
    return register({ id, element })
  }, [register, id, isPresent, ref])

  // Remember the last number this footnote had while present (React's "state from the
  // previous render" pattern: a set during render re-runs only this component, at once).
  const live = id === null ? undefined : scope?.numbers.get(id)
  const [kept, setKept] = useState(live)
  if (isPresent && live !== undefined && live !== kept) setKept(live)

  if (!scope) throw new Error('Cite must be used inside <FootnoteScope>')
  return isPresent ? live : kept
}
