// Lab Partner's signature motion (SPEC F5): when a tool changes something, the controls it changed
// pulse cyan once and the view scrolls to them. Controls opt in with data-lab-target="twin.flow".
// Runs on the DOM directly (Web Animations), so nothing re-renders. A view Lab Partner just
// opened may still be mounting, so it looks again for up to 2 s.

const PULSE_MS = 700
const HOLD_MS = 1_200
const LOOK_FOR_MS = 2_000

function cyan(alpha: number): string {
  const token = getComputedStyle(document.documentElement).getPropertyValue('--color-cyan').trim() || '#06b6d4'
  return `color-mix(in srgb, ${token} ${Math.round(alpha * 100)}%, transparent)`
}

export function pulse(targets: readonly string[], reduceMotion: boolean): void {
  if (targets.length === 0 || typeof document === 'undefined') return
  const started = performance.now()
  const look = () => {
    const elements = targets.flatMap((target) => [
      ...document.querySelectorAll<HTMLElement>(`[data-lab-target="${CSS.escape(target)}"]`),
    ])
    if (elements.length === 0) {
      if (performance.now() - started < LOOK_FOR_MS) window.setTimeout(look, 100)
      return
    }
    elements[0].scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' })
    for (const element of elements) {
      const ring = `0 0 0 2px ${cyan(0.95)}`
      element.animate(
        reduceMotion
          ? // No motion: the ring is simply there, then gone.
            [{ boxShadow: ring }, { boxShadow: ring }]
          : [{ boxShadow: ring }, { boxShadow: ring, offset: 0.25 }, { boxShadow: `0 0 0 10px ${cyan(0)}` }],
        reduceMotion
          ? { duration: HOLD_MS, easing: 'steps(1, end)' }
          : { duration: PULSE_MS, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
      )
    }
  }
  requestAnimationFrame(() => requestAnimationFrame(look))
}
