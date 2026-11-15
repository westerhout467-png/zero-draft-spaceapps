// The Orbital Risk Index weights, in one small store, so they survive a trip to another view and
// the Lab Partner (M6) can set them. The rules are the pure functions in risk.ts.
import { useSyncExternalStore } from 'react'
import { EQUAL_WEIGHTS, setWeight, type IndexKey, type Weights } from './risk'

let weights: Weights = EQUAL_WEIGHTS
const listeners = new Set<() => void>()

function commit(next: Weights) {
  if (next === weights) return
  weights = next
  for (const listener of listeners) listener()
}

export const rankStore = {
  get: () => weights,
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  /** One slider. At least one weight always stays above 0 (risk.setWeight). */
  setWeight: (key: IndexKey, value: number) => commit(setWeight(weights, key, value)),
  reset: () => commit(EQUAL_WEIGHTS),
  /** Puts back weights read earlier with get(): Lab Partner's Undo. */
  restore: (snapshot: Weights) => commit(snapshot),
}

export function useWeights(): Weights {
  return useSyncExternalStore(rankStore.subscribe, rankStore.get)
}
