import { useEffect, useLayoutEffect, useRef } from 'react'
import { burnStore } from '../../lib/burnStore'
import type { TwinState } from '../../lib/burnTwin'

/**
 * Calls `listener` with the Burn Twin's state now and every time it changes, without
 * re-rendering. Dragging the map's point changes the state on every pointer move, so the point
 * and its readout follow through refs (CLAUDE.md interaction 5). The listener should only write
 * to refs. A change of `key` re-runs it at once, e.g. when the plot is resized.
 */
export function useBurnState(listener: (state: TwinState) => void, key = ''): void {
  const latest = useRef(listener)
  useLayoutEffect(() => {
    latest.current = listener
  })
  useLayoutEffect(() => {
    latest.current(burnStore.get())
  }, [key])
  useEffect(() => burnStore.subscribe(() => latest.current(burnStore.get())), [])
}
