import { useMotionValueEvent, type MotionValue } from 'motion/react'
import { useId, useRef } from 'react'
import { introCount, type AuditCounter as Counter, type CounterTone } from '../../lib/auditBar'
import { formatHash, type ViewId } from '../../lib/route'
import { paramsFromLink } from '../../lib/testWall'
import { FootnotePreview } from '../FootnotePreview'
import { useHoverPreview } from '../useHoverPreview'

const TONE: Record<CounterTone, string> = {
  ink: 'text-ink',
  red: 'text-red',
  amber: 'text-amber',
  'dim-amber': 'text-amber/70',
}

const SUMMARIZE: ViewId = 'summarize'

type AuditCounterProps = {
  counter: Counter
  /** The intro's progress, 0 to 1. The number is written through a ref as it changes. */
  progress: MotionValue<number>
  onFollow: (counter: Counter) => void
}

/** One audit counter: a label and its number, linking to SUMMARIZE with its filter on. */
export function AuditCounter({ counter, progress, onFollow }: AuditCounterProps) {
  const numberRef = useRef<HTMLSpanElement>(null)
  const linkRef = useRef<HTMLAnchorElement>(null)
  const previewId = useId()
  const preview = useHoverPreview()

  useMotionValueEvent(progress, 'change', (p) => {
    if (numberRef.current) numberRef.current.textContent = introCount(counter.value, p)
  })

  return (
    <li>
      <a
        ref={linkRef}
        href={formatHash(SUMMARIZE, paramsFromLink(counter.link))}
        onClick={() => {
          preview.hide(true)
          onFollow(counter)
        }}
        aria-describedby={preview.open ? previewId : undefined}
        className="flex items-baseline gap-2 text-sm whitespace-nowrap text-muted hover:text-ink"
        {...preview.triggerProps}
      >
        {counter.label}
        <span ref={numberRef} className={`num ${TONE[counter.tone]}`}>
          {introCount(counter.value, progress.get())}
        </span>
      </a>
      {preview.open && (
        <FootnotePreview
          id={previewId}
          anchor={linkRef}
          text={`${counter.label}: ${counter.definition}`}
          {...preview.previewProps}
        />
      )}
    </li>
  )
}
