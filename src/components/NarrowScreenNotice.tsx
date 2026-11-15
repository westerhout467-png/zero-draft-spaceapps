import { useState, useSyncExternalStore } from 'react'

/** Below this width the instruments overlap (CLAUDE.md: desktop-first, nothing may break at 1280). */
const NARROW = '(max-width: 1023px)'

function subscribe(onChange: () => void) {
  const query = window.matchMedia(NARROW)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}
const isNarrow = () => window.matchMedia(NARROW).matches

/**
 * On a phone or a narrow window, say plainly that the console needs a wider screen, instead of
 * showing overlapping instruments. One button lets the reader carry on anyway.
 */
export function NarrowScreenNotice() {
  const narrow = useSyncExternalStore(subscribe, isNarrow, () => false)
  const [dismissed, setDismissed] = useState(false)
  if (!narrow || dismissed) return null
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="narrow-title"
      className="fixed inset-0 z-50 flex flex-col justify-center gap-6 overflow-y-auto bg-graphite px-6 py-12"
    >
      <p className="text-lg font-bold">ZERO-DRAFT</p>
      <h1 id="narrow-title" className="text-xl leading-7">
        This console is built for a laptop or desktop screen, 1280 pixels wide or more.
      </h1>
      <p className="text-sm leading-6 text-muted">
        On a narrower screen its instruments overlap and the numbers become hard to read. Open this link on a computer
        to explore NASA’s BASS-II fire tests, the Burn Twin and the cabin fire simulator.
      </p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="w-fit rounded-sm border border-line px-4 py-2 text-sm hover:border-ink/60 active:scale-[0.97]"
      >
        Show it anyway
      </button>
    </div>
  )
}
