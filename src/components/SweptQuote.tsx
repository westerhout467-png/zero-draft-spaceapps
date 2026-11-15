import { useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import { splitEmphasis } from '../lib/claims'

type SweptQuoteProps = {
  quote: string
  /** The phrase inside `quote` to underline (Claim.emphasis). */
  emphasis?: string
  /** Wait this long before the underline draws (the drawer's slide-in), in ms. */
  delayMs: number
}

/**
 * NASA's verbatim words, set in Source Serif 4 with a cyan rule on the left and no fill.
 * When the claim has an emphasis phrase, a thin underline draws under it, left to right and
 * across line breaks (F6's signature motion; the `quote-emphasis` utility in index.css).
 * Under reduced motion the underline is there at once.
 */
export function SweptQuote({ quote, emphasis, delayMs }: SweptQuoteProps) {
  const reduceMotion = useReducedMotion()
  const [drawn, setDrawn] = useState(false)
  const parts = splitEmphasis(quote, emphasis)

  useEffect(() => {
    if (!parts.emphasis || reduceMotion) return
    const timer = window.setTimeout(() => setDrawn(true), delayMs)
    return () => window.clearTimeout(timer)
  }, [parts.emphasis, reduceMotion, delayMs])

  return (
    <blockquote className="border-l-2 border-cyan pl-4 font-serif text-lg leading-7 text-ink">
      {parts.before}
      {parts.emphasis && (
        <span className="quote-emphasis" data-drawn={drawn || reduceMotion === true}>
          {parts.emphasis}
        </span>
      )}
      {parts.after}
    </blockquote>
  )
}
