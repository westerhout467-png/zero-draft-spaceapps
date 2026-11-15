import { useMotionValueEvent, type MotionValue } from 'motion/react'
import { useId, useRef, useState, type KeyboardEvent } from 'react'
import type { Severity } from '../../lib/audit'
import { introClip, ROVING_TAB_INDEX, stepSegment, type AuditSegment } from '../../lib/auditBar'
import { FootnotePreview } from '../FootnotePreview'
import { useHoverPreview } from '../useHoverPreview'

const FILL: Record<Severity, string> = {
  quarantined: 'bg-red',
  'co-over-range': 'bg-amber',
  warning: 'bg-amber/45',
  clean: 'bg-emerald/40',
}

type AuditSegmentsProps = {
  segments: readonly AuditSegment[]
  progress: MotionValue<number>
  onFollow: (segment: AuditSegment) => void
}

/**
 * One segment per test, colored by its most serious flag. One tab stop: arrow keys, Home and End
 * step through the tests, and each shows its test and flag in a preview. A click or Enter opens
 * that test in SUMMARIZE. The bar is revealed left to right by the intro (a clip, not a re-render).
 */
export function AuditSegments({ segments, progress, onFollow }: AuditSegmentsProps) {
  const barRef = useRef<HTMLDivElement>(null)
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const [active, setActive] = useState(ROVING_TAB_INDEX.active)

  useMotionValueEvent(progress, 'change', (p) => {
    if (barRef.current) barRef.current.style.clipPath = introClip(p)
  })

  function onKeyDown(event: KeyboardEvent, index: number) {
    const next = stepSegment(index, event.key, segments.length)
    if (next === null) return
    event.preventDefault()
    setActive(next)
    buttons.current[next]?.focus()
  }

  return (
    <div
      ref={barRef}
      role="group"
      aria-label="One segment per test, colored by its most serious flag. Arrow keys step through the tests."
      className="flex h-6 min-w-24 flex-1 items-stretch gap-px @max-[72rem]/audit:hidden"
      style={{ clipPath: introClip(progress.get()) }}
    >
      {segments.map((segment, index) => (
        <Segment
          key={segment.testId}
          segment={segment}
          tabIndex={index === active ? ROVING_TAB_INDEX.active : ROVING_TAB_INDEX.inactive}
          buttonRef={(element) => {
            buttons.current[index] = element
          }}
          onFocus={() => setActive(index)}
          onKeyDown={(event) => onKeyDown(event, index)}
          onFollow={onFollow}
        />
      ))}
    </div>
  )
}

type SegmentProps = {
  segment: AuditSegment
  tabIndex: number
  buttonRef: (element: HTMLButtonElement | null) => void
  onFocus: () => void
  onKeyDown: (event: KeyboardEvent) => void
  onFollow: (segment: AuditSegment) => void
}

function Segment({ segment, tabIndex, buttonRef, onFocus, onKeyDown, onFollow }: SegmentProps) {
  const ref = useRef<HTMLButtonElement | null>(null)
  const previewId = useId()
  const preview = useHoverPreview()
  return (
    <>
      <button
        ref={(element) => {
          ref.current = element
          buttonRef(element)
        }}
        type="button"
        tabIndex={tabIndex}
        aria-label={segment.label}
        aria-describedby={preview.open ? previewId : undefined}
        onClick={() => {
          preview.hide(true)
          onFollow(segment)
        }}
        {...preview.triggerProps}
        onFocus={(event) => {
          onFocus()
          preview.triggerProps.onFocus(event)
        }}
        onKeyDown={(event) => {
          preview.triggerProps.onKeyDown(event)
          onKeyDown(event)
        }}
        className="group flex min-w-0 flex-1 cursor-pointer items-center focus-visible:outline-offset-0"
      >
        <span className={`block h-1.5 w-full group-hover:h-3 ${FILL[segment.severity]}`} />
      </button>
      {preview.open && <FootnotePreview id={previewId} anchor={ref} text={segment.label} {...preview.previewProps} />}
    </>
  )
}
