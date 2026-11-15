import type { FlowConfig, Severity } from '../../lib/audit'
import type { Outcome } from '../../lib/generatedData'

/**
 * Flow direction as a tiny mark, so it never rests on color alone:
 * opposed ▸◂ (flow meets the spreading flame), concurrent ▸▸ (flow goes with it),
 * stagnation ▸| (flow onto the tip), not stated ○.
 */
export function FlowGlyph({ flow, className = '' }: { flow: FlowConfig | null; className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 12 6" className={`h-1.5 w-3 ${className}`} fill="currentColor">
      {flow === 'Opposed' && <path d="M0 0L4.5 3L0 6ZM12 0L7.5 3L12 6Z" />}
      {flow === 'Concurrent' && <path d="M0 0L4.5 3L0 6ZM6 0L10.5 3L6 6Z" />}
      {flow === 'Stagnation' && <path d="M0 0L4.5 3L0 6ZM8 0H9.5V6H8Z" />}
      {flow === null && <circle cx="3" cy="3" r="2.25" fill="none" stroke="currentColor" strokeWidth="1" />}
    </svg>
  )
}

/** A test's most serious flag as a mark: × quarantined, ▲ CO over range, • other warning. */
export function StatusGlyph({ severity, className = '' }: { severity: Severity; className?: string }) {
  if (severity === 'clean') return null
  return (
    <svg aria-hidden="true" viewBox="0 0 7 7" className={`size-[7px] ${className}`}>
      {severity === 'quarantined' && <path d="M1 1L6 6M6 1L1 6" stroke="var(--color-red)" strokeWidth="1.4" />}
      {severity === 'co-over-range' && <path d="M3.5 0.5L6.8 6.5H0.2Z" fill="var(--color-amber)" />}
      {severity === 'warning' && <circle cx="3.5" cy="3.5" r="2" fill="var(--color-amber)" fillOpacity="0.7" />}
    </svg>
  )
}

/**
 * What NASA's notes say the flame did, as a mark (never color alone): a filled flame for a
 * sustained flame, a flame in outline for a brief ignition, a bar for no ignition, three dots
 * for not stated.
 */
export function OutcomeGlyph({ outcome, className = '' }: { outcome: Outcome; className?: string }) {
  const flame = 'M3.5 0.6C5.3 2.6 6 3.7 6 4.6A2.5 2.5 0 0 1 1 4.6C1 3.7 1.7 2.6 3.5 0.6Z'
  return (
    <svg aria-hidden="true" viewBox="0 0 7 7.5" className={`h-2 w-[7px] ${className}`}>
      {outcome === 'sustained' && <path d={flame} fill="currentColor" />}
      {outcome === 'brief' && <path d={flame} fill="none" stroke="currentColor" strokeWidth="0.9" />}
      {outcome === 'no-ignition' && <path d="M0.8 4.2H6.2" stroke="currentColor" strokeWidth="1.3" />}
      {outcome === 'not-stated' && (
        <g fill="currentColor">
          <circle cx="1" cy="5.4" r="0.75" />
          <circle cx="3.5" cy="5.4" r="0.75" />
          <circle cx="6" cy="5.4" r="0.75" />
        </g>
      )}
    </svg>
  )
}
