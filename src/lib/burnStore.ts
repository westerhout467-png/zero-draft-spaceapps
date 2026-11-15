// The Burn Twin's state, in one small store. The Overview stage, its controls, the Eq. 6.1 inset
// and (from M4) the flammability map all read and write it, so moving a control in one place
// moves the others. The rules are the pure functions in burnTwin.ts.
import { useSyncExternalStore } from 'react'
import * as twin from './burnTwin'
import type { RodMm } from './physics'

let state = twin.initialTwin()
const listeners = new Set<() => void>()

function commit(next: twin.TwinState) {
  if (next === state) return
  state = next
  for (const listener of listeners) listener()
}

export const burnStore = {
  /** The current state. The animation loop reads this every frame, outside React. */
  get: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  setO2: (o2Pct: number) => commit(twin.setO2(state, o2Pct)),
  setFlow: (flowCmS: number) => commit(twin.setFlow(state, flowCmS)),
  setRod: (rodMm: RodMm) => commit(twin.setRod(state, rodMm)),
  ignite: () => commit(twin.ignite(state)),
  reset: () => commit(twin.reset()),
  /** Puts back a state read earlier with get(): Lab Partner's Undo. */
  restore: (snapshot: twin.TwinState) => commit(snapshot),
  /** Starts the 10 s drain, or jumps straight to its end under reduced motion. */
  drain: (instantly = false) =>
    commit(instantly ? twin.drainInstantly(state) : twin.startDrain(state)),
  /** Advances a running drain. Called once per animation frame. */
  tick: (dtMs: number) => commit(twin.tickDrain(state, dtMs)),
}

/**
 * Reads one value from the store. Pick something that changes rarely (a flag, the rod, a stamp):
 * the component re-renders only when that value changes. O2 changes every frame during a drain,
 * so values that follow it are written to the DOM through refs instead (see useTwinFrame).
 */
export function useTwin<T>(selector: (state: twin.TwinState) => T): T {
  return useSyncExternalStore(burnStore.subscribe, () => selector(state))
}
