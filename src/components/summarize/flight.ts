import type { Transition } from 'motion/react'

// The quarantine flight (F2's signature motion), after Emil Kowalski's rules: tiles move on
// screen, so a strong ease-in-out; a short stagger so they leave one after another; the way back
// is a little quicker than the way in. Under reduced motion, MotionConfig makes it instant.

const EASE_IN_OUT: [number, number, number, number] = [0.77, 0, 0.175, 1]
const FLY_IN_S = 0.5
const FLY_BACK_S = 0.4
const STAGGER_S = 0.04

/** Into the bay: the nth quarantined tile leaves n staggers after the first. */
export function flyIn(order: number): Transition {
  return { layout: { duration: FLY_IN_S, ease: EASE_IN_OUT, delay: order * STAGGER_S } }
}

/** Back to the wall. */
export function flyBack(order: number): Transition {
  return { layout: { duration: FLY_BACK_S, ease: EASE_IN_OUT, delay: order * STAGGER_S * 0.5 } }
}

/** When the nth tile has landed: its reason chip fades in then. */
export function landedAt(order: number): number {
  return FLY_IN_S + order * STAGGER_S
}

/**
 * Arriving at SUMMARIZE with quarantine already on (from the audit bar's link, or a deep link),
 * the tiles first show in the wall and then fly to the bay, this long after the view mounts: just
 * past the 150 ms view crossfade, so the flight is seen. Not used under reduced motion.
 */
export const ENTRY_FLIGHT_DELAY_MS = 250

/** A tile that never flies (not quarantined) still needs a transition object. */
export const STILL: Transition = { layout: { duration: 0 } }
