import { useReducedMotion, type Transition } from 'motion/react'

// The leaderboard's signature motion (SPEC F3a): when a weight changes, rows slide to their new
// places and the fingerprint bars morph, together, in 350 ms. Rows move on screen, so the strong
// ease-in-out from the emil-design-eng skill. Under reduced motion it is an instant change.

const EASE_IN_OUT: [number, number, number, number] = [0.77, 0, 0.175, 1]
const REORDER_S = 0.35
/** A row leaving for the unscored list, or coming back, fades. It doesn't move. */
const FADE_S = 0.15

export function useReorder(): { move: Transition; fade: Transition } {
  const still = useReducedMotion() ?? false
  return {
    move: { duration: still ? 0 : REORDER_S, ease: EASE_IN_OUT },
    fade: { duration: still ? 0 : FADE_S, ease: 'easeOut' },
  }
}
