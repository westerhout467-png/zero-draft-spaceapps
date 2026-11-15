// How INTERPRET's live parts keep up with the simulation clock without re-rendering React every
// frame. Each part that shows a live value (a readout, a chart line, the scrubber) subscribes with
// useSimFrame and writes that value straight to the DOM through a ref (CLAUDE.md "Interaction
// details" 5). Charts and readouts take at most 30 updates a second (SPEC F4).
import { useEffect, useLayoutEffect, useRef } from 'react'
import { interpretStore, type SimState } from '../../lib/interpretStore'

/** Charts and readouts update at most this many times a second while the simulation plays. */
export const CHART_HZ = 30

/**
 * Calls `listener` with the store's state whenever it changes, and once after each render of the
 * component. With `maxHz`, playback frames come at most that often; a pause, seek, preset or new
 * input always comes through at once. The listener writes to refs only; it must not set React state.
 */
export function useSimFrame(listener: (state: SimState) => void, maxHz?: number): void {
  const latest = useRef(listener)
  useLayoutEffect(() => {
    latest.current = listener
    listener(interpretStore.get())
  })
  useEffect(() => {
    const interval = maxHz ? 1000 / maxHz : 0
    // When the next playback frame may go through. Kept in step with the frames before it, so a
    // 60 Hz display gives every second frame rather than drifting between every second and third.
    let next = 0
    let shown: SimState | null = null
    return interpretStore.subscribe(() => {
      const state = interpretStore.get()
      if (state === shown) return
      const now = performance.now()
      if (state.playing && state.cause === 'play' && now < next - 1) return
      next = now - next > interval ? now + interval : next + interval
      shown = state
      latest.current(state)
    })
  }, [maxHz])
}

/** A design token's value, such as token('red') for --color-red, for canvas and Web Animations. */
export function token(name: 'cyan' | 'amber' | 'red' | 'ink' | 'muted' | 'emerald'): string {
  return getComputedStyle(document.documentElement).getPropertyValue(`--color-${name}`).trim()
}

/** The strong ease-out the app uses for things that arrive (CLAUDE.md, emil-design-eng). */
export const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)'
