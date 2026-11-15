import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type PointerEvent } from 'react'

/** Hovering waits this long before the first preview, so a passing pointer doesn't flash one. */
const OPEN_DELAY_MS = 400
/** Leaving waits this long, so the pointer can cross the gap onto the preview. */
const CLOSE_DELAY_MS = 120
/** Within this time of one preview closing, the next opens at once (moving along a row). */
const WARM_MS = 600
let lastClosedAt = -Infinity

/**
 * Open and close timing for a one-line hover preview (CLAUDE.md interaction 10): it waits a
 * moment on first hover, opens at once on keyboard focus or when moving along a row of them,
 * stays open while the pointer is on it, and closes on Esc. Spread `triggerProps` on the trigger
 * and `previewProps` on the FootnotePreview.
 */
export function useHoverPreview() {
  const [open, setOpen] = useState(false)
  const openRef = useRef(false)
  const timer = useRef<number | undefined>(undefined)

  function set(next: boolean) {
    if (openRef.current && !next) lastClosedAt = performance.now()
    openRef.current = next
    setOpen(next)
  }

  function show(now: boolean) {
    window.clearTimeout(timer.current)
    if (now || performance.now() - lastClosedAt < WARM_MS) set(true)
    else timer.current = window.setTimeout(() => set(true), OPEN_DELAY_MS)
  }

  function hide(now: boolean) {
    window.clearTimeout(timer.current)
    if (now) set(false)
    else timer.current = window.setTimeout(() => set(false), CLOSE_DELAY_MS)
  }

  // A preview is pinned to where its trigger was; close it if anything scrolls.
  useEffect(() => {
    if (!open) return
    const close = () => {
      window.clearTimeout(timer.current)
      set(false)
    }
    window.addEventListener('scroll', close, true)
    return () => window.removeEventListener('scroll', close, true)
  }, [open])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const triggerProps = {
    onPointerEnter: (event: PointerEvent) => {
      if (event.pointerType === 'mouse') show(false)
    },
    onPointerLeave: () => hide(false),
    onFocus: (event: FocusEvent<HTMLElement>) => {
      if (event.currentTarget.matches(':focus-visible')) show(true)
    },
    onBlur: () => hide(true),
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === 'Escape' && openRef.current) {
        event.stopPropagation()
        hide(true)
      }
    },
  }
  const previewProps = { onPointerEnter: () => show(true), onPointerLeave: () => hide(false) }

  return { open, hide, triggerProps, previewProps }
}
