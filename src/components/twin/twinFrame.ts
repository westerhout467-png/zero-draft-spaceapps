// How the Burn Twin's HTML keeps up with its canvas without re-rendering React every frame.
// The animation loop publishes one TwinFrame per frame; each component that shows a live value
// (a readout, a mark on the gauge, the dot on the chart) subscribes with useTwinFrame and writes
// that value straight to the DOM through a ref (CLAUDE.md "Interaction details" 5).
import { createContext, useContext, useEffect, useLayoutEffect, useRef } from 'react'
import type { Point, StageLayout } from '../../lib/twinLayout'

export interface TwinFrame {
  layout: StageLayout
  o2Pct: number
  flowCmS: number
  /** Points of O2 above (+) or below (−) the 1g limit. */
  earthMarginPts: number
  /** Eq. 6.1 at the current flow and rod: stretch rate, limit, margin. */
  orbit: { a: number; limitPct: number; marginPts: number }
  /** Parallax offsets, px. */
  flameShift: Point
  gaugeShift: Point
  /** The box around the orbit flame, stage px. */
  orbitBox: { left: number; top: number; width: number; height: number }
}

export type FrameListener = (frame: TwinFrame) => void

export interface FrameBus {
  /** The most recent frame, for components that mount between frames. */
  last: TwinFrame | null
  subscribe(listener: FrameListener): () => void
  emit(frame: TwinFrame): void
}

export function createFrameBus(): FrameBus {
  const listeners = new Set<FrameListener>()
  const bus: FrameBus = {
    last: null,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    emit(frame) {
      bus.last = frame
      for (const listener of listeners) listener(frame)
    },
  }
  return bus
}

export const FrameBusContext = createContext<FrameBus | null>(null)

export function useFrameBus(): FrameBus {
  const bus = useContext(FrameBusContext)
  if (!bus) throw new Error('Burn Twin parts must be inside <BurnTwin>')
  return bus
}

/**
 * Calls `listener` on every animation frame, and once after each render of the component (so
 * elements that have just appeared get their values even while the loop is paused).
 * The listener should only write to refs; it must not set React state.
 */
export function useTwinFrame(listener: FrameListener): void {
  const bus = useFrameBus()
  const latest = useRef(listener)
  useLayoutEffect(() => {
    latest.current = listener
    if (bus.last) listener(bus.last)
  })
  useEffect(() => bus.subscribe((frame) => latest.current(frame)), [bus])
}

/** Sets an element's text only when it has changed. The element must have no React children. */
export function setText(element: Element | null, text: string): void {
  if (element && element.textContent !== text) element.textContent = text
}

/** Moves an element with a transform only when the offset has changed by a visible amount. */
export function moveTo(element: HTMLElement | SVGElement | null, x: number, y: number): void {
  if (!element) return
  const transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`
  if (element.style.transform !== transform) element.style.transform = transform
}
