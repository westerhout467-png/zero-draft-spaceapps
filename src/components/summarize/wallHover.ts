import { useSyncExternalStore } from 'react'

// Which tile the pointer or keyboard is on. Kept outside React state, so hovering along the wall
// re-renders only the one-line readout, never the 129 tiles.
let current: string | null = null
const listeners = new Set<() => void>()

export const wallHover = {
  set(testId: string | null) {
    if (testId === current) return
    current = testId
    for (const listener of listeners) listener()
  },
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
}

export function useWallHover(): string | null {
  return useSyncExternalStore(wallHover.subscribe, () => current)
}
